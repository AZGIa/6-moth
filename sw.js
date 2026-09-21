/* 182 дня — офлайн-кэш. Поднимай VERSION при каждом обновлении файлов. */
var VERSION = "182dnya-v1";
var ASSETS = ["./","./index.html","./styles.css","./app.js","./plan.js","./words.js",
  "./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(ASSETS) })
    .then(function(){ return self.skipWaiting() }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION })
      .map(function(k){ return caches.delete(k) }));
  }).then(function(){ return self.clients.claim() }));
});

self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true}).then(function(hit){
      if(hit) return hit;
      return fetch(e.request).then(function(res){
        if(res && res.ok && res.type === "basic"){
          var copy = res.clone();
          caches.open(VERSION).then(function(c){ c.put(e.request, copy) });
        }
        return res;
      }).catch(function(){
        if(e.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
