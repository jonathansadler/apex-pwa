// Required script for IndexedDB
importScripts('/lib/localForage/localforage.min.js');

// THESE FILES (sw.js and manifest.json) HAVE TO BE SERVED FROM ORDS DOC ROOT. MORE INFO:
// https://github.com/vincentmorneau/apex-pwa/blob/master/doc/part2.md

// The list of all APEX pages in your app
// Example: If app 1694 contains pages 1 and 2
const apexAppId = 1694; // CHANGE_ME
const apexPages = [1, 2]; // CHANGE_ME

// It is recommended to have a page 404 as well, in case something goes wrong with the cache
// Example: If the APEX app contains page 404
const apex404Page = [404]; // CHANGE_ME

// Leave these global variables as is
const cacheStaticName = 'static-cache';
const cache404Name = '404-cache';
const cacheDynamicName = 'dynamic-cache';
const apexPagesUrl = [];
const apex404PagesUrl = [];

/**
 * All service worker events
 **/
self.addEventListener('install', event => {
	console.log('[SW] Installing service worker:', event);
	event.waitUntil(installSW());
});

self.addEventListener('activate', event => {
	console.log('[SW] Activating service worker:', event);
	return self.clients.claim();
});

self.addEventListener('fetch', event => {
	event.respondWith(fetchSW(event));
});

self.addEventListener('sync', event => {
	console.log('[SW] Syncing', event);
	event.waitUntil(syncSW(event));
});

self.addEventListener('push', event => {
	console.log('[SW] Push Received.', event);
	event.waitUntil(pushSW(event));
});

self.addEventListener('notificationclick', event => {
	console.log('[SW] Notification clicked', event);
});

self.addEventListener('notificationclose', event => {
	console.log('[SW] Notification closed', event);
});

/**
 * @function broadcastRefresh
 * Broadcasts a message to the client, which allows to refresh reports
 * after data has been saved
 **/
function broadcastRefresh(refreshReportIds) {
	self.clients.matchAll().then(function (clients) {
		clients.forEach(function (client) {
			client.postMessage({
				refreshReportIds: refreshReportIds
			});
		});
	});
}

/**
 * @function installSW
 * Installs all static resources for the app shell
 **/
async function installSW() {
	let clientUrl;

	// Getting the current page URL (with APEX session & everything else)
	await self.clients.matchAll({
		includeUncontrolled: true
	}).then(clients => {
		for (const client of clients) {
			if (new URL(client.url).search.split(':')[0] === '?p=' + apexAppId) {
				clientUrl = new URL(client.url);
			}
		}
	});

	if (clientUrl) {
		// Apply the current page URL to the array of static pages to cache (apexPages)
		for (const apexPage of apexPages) {
			let queryString = clientUrl.search.split(':');
			queryString[1] = apexPage;
			queryString = queryString.join(':');
			apexPagesUrl.push(clientUrl.origin + clientUrl.pathname + queryString);
		}

		// Apply the current page URL to the array of static pages to cache (apex404Page)
		for (const apexPage of apex404Page) {
			let queryString = clientUrl.search.split(':');
			queryString[1] = apexPage;
			queryString = queryString.join(':');
			apex404PagesUrl.push(clientUrl.origin + clientUrl.pathname + queryString);
		}

		// Store all static pages in the static cache
		const cacheStatic = await caches.open(cacheStaticName);
		cacheStatic.addAll(apexPagesUrl)
			.then(function () {
				console.log('[SW] Caching static files', apexPagesUrl);
			})
			.catch(function (err) {
				console.error(err);
			});

		// Store all 404 pages in the 404 cache
		const cache404 = await caches.open(cache404Name);
		cache404.addAll(apex404PagesUrl)
			.then(function () {
				console.log('[SW] Caching 404 files', apex404PagesUrl);
			})
			.catch(function (err) {
				console.error(err);
			});
	}
}

/**
 * @function fetchSW
 * Intercepts resources, caches resources, serves resources
 **/
async function fetchSW(event) {
	try {
		const serverResponse = await fetch(event.request);

		if (serverResponse) {
			const cacheResponse = await caches.match(event.request);

			if (cacheResponse) {
				console.log('[SW] Fetching from server. No need to cache:', event.request.url);
			} else {
				console.log('[SW] Fetching from server, then caching request:', event.request.url);
				const cacheDynamic = await caches.open(cacheDynamicName);
				cacheDynamic.put(event.request.url, serverResponse.clone());
			}
		}

		return serverResponse;
	} catch (serverErr) {
		const cacheResponse = await caches.match(event.request);

		if (cacheResponse) {
			console.log('[SW] Fetching from server failed. Fetching from cache:', event.request.url);
			return cacheResponse;
		} else {
			console.log('[SW] Fetching from server & cache failed for request:', event.request.url);
			if (event.request.headers.get('accept').includes('text/html')) {
				const cache404 = await caches.open(cache404Name);
				return cache404.match(apex404PagesUrl);
			}
		}
	}
}

/**
 * @function syncSW
 * Executes a list of offline tasks when the service worker detects connectivity is back
 **/
async function syncSW(event) {
	// This example handles a sync task called pwa-offline-tasks
	if (event.tag === 'pwa-offline-tasks') {
		const tasks = [];
		const refreshReportIds = [];

		// Configure the IndexedDB to use pwa-offline-tasks database
		localforage.config({
			name: 'pwa-offline-tasks'
		});

		// Looping through all tasks in the pwa-offline-tasks database
		localforage.iterate(function (value, key, iterationNumber) {
			// Building an array of tasks
			tasks.push(fetch(value.endpoint, value.options));
			refreshReportIds.push(value.refreshReportId);
		}).then(function (data) {
			Promise.all(tasks)
				.then(function (data) {
					console.log('[SW] Offline tasks sync succeeded.', data);
					// Refresh APEX reports
					broadcastRefresh(refreshReportIds);
					// CLear the IndexedDB
					localforage.clear();
				}).catch(function (err) {
					console.error('[SW] Offline tasks sync failed:', err);
				});
		}).catch(function (err) {
			console.error('[SW] Iterate through offline tasks failed:', err);
		});
	}
}

/**
 * @function pushSW
 * Received a notification and shows it to the user
 **/
async function pushSW(event) {
	// Parse the notification received as a JSON object
	notification = JSON.parse(event.data.text());

	// Show the notification
	self.registration.showNotification(
		notification.title, {
			body: notification.body,
			icon: './images/icons/icon-192x192.png',
			badge: './images/icons/icon-192x192.png'
		}
	);
}
