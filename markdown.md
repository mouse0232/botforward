## Preview uses prod kv


```
[[kv_namespaces]]
binding = "MESSAGE_CACHE"
id = "a2eec8ca45f44211b20ed98d662ab42b"
preview_id = "a2eec8ca45f44211b20ed98d662ab42b"

```
> wrangler.toml sets MESSAGE_CACHE preview_id equal to the production id, so preview/dev runs will read/write the same KV namespace as production. This risks accidental production data corruption and makes preview behavior non-isolated.

## Undefined cleanup method


```
    return cached.message;
  }
```
> ChannelSelector.cacheMessage() still calls cleanupExpiredMessages(), but cleanupExpiredMessages() was removed from the class, causing a TypeScript build/typecheck failure. This blocks deploys and breaks the cache fallback path.


## 异步签名改了，但还有调用方没跟上。


```
 async cacheMessage(key: string, message: TelegramMessage): Promise<void> {

```
> src/command-handler.ts:47-54 仍然是 this.channelSelector.cacheMessage(cacheKey, replyToMessage); 后马上展示按钮。这样按钮可能先发出去，缓存还没写完，而且 Promise rejection 也会被直接丢掉。

## 只写 KV 会导致读后写竞态：put 成功后需同时写入内存镜像（移除 return）


```
// 优先使用 KV 持久化存储
    if (this.kvCache) {
      try {
        await this.kvCache.put(key, JSON.stringify(message), {
          expirationTtl: 300 // 5分钟
        });
        return;
      } catch (error) {
        console.warn('KV cache write failed, falling back to memory cache:', error);
      }
    }
```

> cacheMessage() 在 kvCache.put() 成功后直接 return，不会写入 messageCache；而 getCachedMessage() 只有在 kvCache.get() 返回 null/失败时才会回退到 messageCache。考虑到 Cloudflare Workers KV 为最终一致性，不保证写入完成后立即在后续请求/不同 PoP 可读，就可能出现“刚缓存、立刻点按钮却读不到”（KV 暂时读不到时回退无数据）。

## cleanupExpiredMessages 已经不存在了


```
// 回退到内存缓存
    this.cleanupExpiredMessages();
```
> 当前类里没有这个私有方法，但这里还在调用，TypeScript 会直接编译失败。要么把方法补回来，要么把过期清理逻辑内联到回退分支里。

## 不要让 delete() 失败把一次成功命中变成“未命中”


```
 if (this.kvCache) {
      try {
        const cached = await this.kvCache.get(key, 'json');
        if (cached) {
          await this.kvCache.delete(key);
          return cached as TelegramMessage;
        }
      } catch (error) {
        console.warn('KV cache read failed, falling back to memory cache:', error);

```
> 这里把 get() 和 delete() 放进了同一个 try。如果值已经读到了，但 delete(key) 瞬时失败，就会走 catch 并回退到内存缓存；而成功写入 KV 的路径并没有内存副本，最终会把一条实际存在的消息误判成过期。
