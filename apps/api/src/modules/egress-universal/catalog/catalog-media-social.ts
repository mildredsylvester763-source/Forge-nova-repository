// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/catalog/catalog-media-social.ts
// ============================================================================
// Social platforms, music, podcasts, video, images, games, and sports data
// destinations.
import { DestinationDefinition, D } from './destination-types';

export const MEDIA_SOCIAL: DestinationDefinition[] = [
  // Social platforms.
  D('x-twitter', 'X (Twitter)', 'social', 'https://api.twitter.com', 'bearer', ['botToken'], '/2/tweets', undefined, ['accessToken', 'refreshToken']),
  D('facebook', 'Facebook', 'social', 'https://graph.facebook.com', 'bearer', ['accessToken'], '/v19.0/me', undefined, ['refreshToken', 'appId', 'appToken']),
  D('instagram', 'Instagram', 'social', 'https://graph.instagram.com', 'bearer', ['accessToken'], '/v19.0/me', undefined, ['appId']),
  D('linkedin', 'LinkedIn', 'social', 'https://api.linkedin.com', 'bearer', ['accessToken'], '/v2/me', undefined, ['refreshToken', 'appId', 'appToken']),
  D('tiktok', 'TikTok', 'social', 'https://open.tiktokapis.com', 'bearer', ['accessToken'], '/v2/user/info/', undefined, ['clientToken']),
  D('youtube', 'YouTube', 'media', 'https://www.googleapis.com', 'bearer', ['apiKey'], '/youtube/v3/videos', undefined, ['accessToken']),
  D('reddit', 'Reddit', 'social', 'https://www.reddit.com', 'oauth-code', ['clientId', 'clientSecret'], '/api/v1/me.json', undefined, ['username', 'password', 'refreshToken']),
  D('pinterest', 'Pinterest', 'social', 'https://api.pinterest.com', 'bearer', ['accessToken'], '/v5/pins', undefined, ['refreshToken']),
  D('snapchat', 'Snapchat', 'social', 'https://ads.snapchat.com', 'bearer', ['accessToken'], '/v1/me/organizations', undefined, ['clientToken']),
  D('twitch', 'Twitch', 'media', 'https://api.twitch.tv', 'api-key-header', ['appId', 'accessToken'], '/helix/users', 'Client-Id'),
  D('mastodon', 'Mastodon', 'social', 'https://mastodon.social', 'bearer', ['accessToken'], '/api/v1/accounts/verify_credentials'),
  D('bluesky', 'Bluesky (AT Protocol)', 'social', 'https://bsky.social', 'bearer', ['accessToken'], '/xrpc/app.bsky.actor.getProfile'),
  D('vk', 'VK', 'social', 'https://api.vk.com', 'bearer', ['accessToken'], '/method/users.get', undefined, ['appId']),
  D('threads', 'Threads', 'social', 'https://graph.threads.net', 'bearer', ['accessToken'], '/v1.0/me', undefined, ['appId']),
  D('imgur', 'Imgur', 'images', 'https://api.imgur.com', 'bearer', ['clientId'], '/3/credits', undefined, ['accessToken', 'refreshToken']),
  D('flickr', 'Flickr', 'images', 'https://www.flickr.com', 'oauth-code', ['apiKey', 'secretKey'], '/services/rest/', undefined, ['accessToken']),
  D('500px', '500px', 'images', 'https://api.500px.com', 'oauth-code', ['consumerKey', 'consumerSecret'], '/v1/photos', undefined, ['accessToken']),
  D('deviantart', 'DeviantArt', 'images', 'https://www.deviantart.com', 'oauth-code', ['clientId', 'clientSecret'], '/api/v1/oauth2/user/whoami', undefined, ['accessToken', 'refreshToken']),
  D('behance', 'Behance', 'images', 'https://www.behance.net', 'oauth-code', ['clientId', 'clientSecret'], '/v2/users/me'),
  D('dribbble', 'Dribbble', 'images', 'https://api.dribbble.com', 'bearer', ['accessToken'], '/v2/user', undefined, ['clientToken']),

  // Music.
  D('spotify', 'Spotify', 'music', 'https://api.spotify.com', 'bearer', ['accessToken'], '/v1/me', undefined, ['refreshToken']),
  D('soundcloud', 'SoundCloud', 'music', 'https://api.soundcloud.com', 'oauth-code', ['clientId', 'clientSecret'], '/me.json', undefined, ['accessToken', 'refreshToken']),
  D('lastfm', 'Last.fm', 'music', 'https://ws.audioscrobbler.com', 'api-key-header', ['apiKey'], '/2.0/', 'User-Agent'),
  D('musixmatch', 'Musixmatch', 'music', 'https://api.musixmatch.com', 'api-key-header', ['apiKey'], '/v1.1/health', 'apikey'),
  D('discogs', 'Discogs', 'music', 'https://api.discogs.com', 'api-key-header', ['consumerKey', 'consumerSecret'], '/database/search', 'Authorization'),
  D('deezer', 'Deezer', 'music', 'https://api.deezer.com', 'bearer', ['accessToken'], '/user/me'),
  D('tidal', 'Tidal', 'music', 'https://api.tidal.com', 'bearer', ['accessToken'], '/v1/sessions/me', undefined, ['refreshToken', 'clientToken']),
  D('bandsintown', 'Bandsintown', 'music', 'https://rest.bandsintown.com', 'api-key-header', ['apiKey'], '/artists/foo', 'app_id'),
  D('setlistfm', 'Setlist.fm', 'music', 'https://api.setlist.fm', 'api-key-header', ['apiKey'], '/1.0/search/setlists', 'x-api-key'),
  D('musicbrainz', 'MusicBrainz', 'music', 'https://musicbrainz.org', 'api-key-header', ['apiKey'], '/ws/2/artist', 'User-Agent'),
  D('genius', 'Genius', 'music', 'https://api.genius.com', 'bearer', ['accessToken'], '/search', undefined, ['clientToken']),

  // Podcasts.
  D('transistor', 'Transistor.fm', 'podcasts', 'https://api.transistor.fm', 'api-key-header', ['apiKey'], '/v1/episodes', 'x-api-key'),
  D('buzzsprout', 'Buzzsprout', 'podcasts', 'https://www.buzzsprout.com', 'api-key-header', ['apiKey'], '/v2/episodes.json', 'Authorization'),
  D('podbean', 'Podbean', 'podcasts', 'https://api.podbean.com', 'bearer', ['accessToken'], '/v1/episodes', undefined, ['clientToken']),
  D('spreaker', 'Spreaker', 'podcasts', 'https://api.spreaker.com', 'oauth-code', ['accessToken', 'refreshToken'], '/v2/users/me'),
  D('captivate', 'Captivate', 'podcasts', 'https://api.captivate.fm', 'bearer', ['apiKey'], '/v1/health'),
  D('listen-notes', 'Listen Notes', 'podcasts', 'https://listen-api.listennotes.com', 'api-key-header', ['apiKey'], '/api/v2/search', 'X-ListenAPI-Key'),
  D('podscribe', 'Podscribe', 'podcasts', 'https://api.podscribe.com', 'api-key-header', ['apiKey'], '/health', 'api-key'),

  // Video.
  D('dailymotion', 'Dailymotion', 'media', 'https://api.dailymotion.com', 'oauth-code', ['apiKey', 'secretKey'], '/me'),
  D('sproutvideo', 'SproutVideo', 'media', 'https://api.sproutvideo.com', 'api-key-header', ['apiKey'], '/api/v1/videos', 'SproutVideo-Api-Key'),
  D('vidyard', 'Vidyard', 'media', 'https://api.vidyard.com', 'bearer', ['accessToken'], '/v1/videos', undefined, ['refreshToken', 'authToken']),
  D('mux', 'Mux', 'media', 'https://api.mux.com', 'basic', ['accessToken', 'secretKey'], '/video/v1/uploads'),
  D('api-video', 'api.video', 'media', 'https://ws.api.video', 'bearer', ['apiKey'], '/videos', undefined, ['refreshToken']),
  D('wistia', 'Wistia', 'media', 'https://api.wistia.com', 'bearer', ['accessToken'], '/v1/medias.json'),
  D('vimeo', 'Vimeo', 'media', 'https://api.vimeo.com', 'bearer', ['accessToken'], '/me/videos', undefined, ['refreshToken']),
  D('cloudinary-media', 'Cloudinary Media', 'media', 'https://api.cloudinary.com', 'api-key-header', ['apiKey', 'secretKey'], '/v1_1/health', 'Authorization'),
  D('frameio', 'Frame.io', 'media', 'https://api.frame.io', 'bearer', ['accessToken'], '/v2/me', undefined, ['refreshToken']),

  // Images.
  D('unsplash', 'Unsplash', 'images', 'https://api.unsplash.com', 'api-key-header', ['apiKey'], '/photos', 'Authorization', ['appId']),
  D('pexels', 'Pexels', 'images', 'https://api.pexels.com', 'api-key-header', ['apiKey'], '/v1/curated', 'Authorization'),
  D('pixabay', 'Pixabay', 'images', 'https://pixabay.com', 'api-key-header', ['apiKey'], '/api/', 'key'),
  D('giphy', 'Giphy', 'images', 'https://api.giphy.com', 'api-key-header', ['apiKey'], '/v1/gifs/trending', 'api_key'),
  D('tenor', 'Tenor', 'images', 'https://tenor.googleapis.com', 'api-key-header', ['apiKey'], '/v2/posts', 'key'),
  D('shutterstock', 'Shutterstock', 'images', 'https://api.shutterstock.com', 'basic', ['username', 'password'], '/v2/images/search', undefined, ['accessToken']),
  D('getty-images', 'Getty Images', 'images', 'https://api.gettyimages.com', 'bearer', ['apiKey'], '/v3/search/images', undefined, ['accessToken', 'refreshToken']),
  D('canva', 'Canva', 'images', 'https://api.canva.com', 'bearer', ['accessToken'], '/v1/me', undefined, ['refreshToken']),

  // Games.
  D('riot-games', 'Riot Games', 'games', 'https://americas.api.riotgames.com', 'api-key-header', ['apiKey'], '/lol/status/v4/platform-data', 'X-Riot-Token'),
  D('steam', 'Steam Web API', 'games', 'https://api.steampowered.com', 'api-key-header', ['apiKey'], '/ISteamApps/GetAppList/v2/', 'key'),
  D('roblox', 'Roblox', 'games', 'https://apis.roblox.com', 'api-key-header', ['apiKey'], '/health', 'x-api-key'),
  D('rawg', 'RAWG', 'games', 'https://api.rawg.io', 'api-key-header', ['apiKey'], '/platforms', 'key'),
  D('igdb', 'IGDB', 'games', 'https://api.igdb.com', 'oauth-code', ['clientId', 'clientSecret'], '/v4/games'),
  D('giantbomb', 'Giant Bomb', 'games', 'https://www.giantbomb.com', 'api-key-header', ['apiKey'], '/api/games/', 'api_key'),
  D('epic-games', 'Epic Games (Epic Online Services)', 'games', 'https://api.epicgames.dev', 'oauth-code', ['clientId', 'clientSecret'], '/v1/health'),

  // Sports.
  D('api-football', 'API-Football', 'sports', 'https://v3.football.api-sports.io', 'api-key-header', ['apiKey'], '/status', 'x-apisports-key'),
  D('sportmonks', 'SportMonks', 'sports', 'https://api.sportmonks.com', 'bearer', ['apiKey'], '/v3/health', undefined, ['accessToken']),
  D('thesportsdb', 'TheSportsDB', 'sports', 'https://www.thesportsdb.com', 'api-key-header', ['apiKey'], '/api/v1/json/3/all_leagues.php', 'Authorization'),
  D('seatgeek', 'SeatGeek', 'sports', 'https://api.seatgeek.com', 'basic', ['clientId', 'secretKey'], '/events'),
  D('ticketmaster', 'Ticketmaster', 'sports', 'https://app.ticketmaster.com', 'api-key-header', ['apiKey'], '/discovery/v2/events.json', 'apikey'),
  D('sportradar', 'Sportradar', 'sports', 'https://api.sportradar.com', 'api-key-header', ['apiKey'], '/health', 'x-radar-key'),
  D('odds-api', 'The Odds API', 'sports', 'https://api.the-odds-api.com', 'api-key-header', ['apiKey'], '/v4/sports', 'apiKey'),
  D('cricapi', 'CricAPI', 'sports', 'https://api.cricapi.com', 'api-key-header', ['apiKey'], '/health', 'x-api-key'),
  D('espn', 'ESPN', 'sports', 'https://site.api.espn.com', 'api-key-header', ['apiKey'], '/apis/site/v2/sports/football/nfl/scoreboard', 'Authorization'),
  D('livescore', 'LiveScore', 'sports', 'https://api.livescore.com', 'api-key-header', ['apiKey'], '/health', 'x-api-key'),

  // Reviews & creator communities.
  D('yelp', 'Yelp Fusion', 'reviews', 'https://api.yelp.com', 'bearer', ['apiKey'], '/v3/businesses/search'),
  D('tripadvisor', 'TripAdvisor', 'reviews', 'https://api.content.tripadvisor.com', 'api-key-header', ['apiKey'], '/api/v1/location/search', 'key'),
  D('letterboxd', 'Letterboxd', 'reviews', 'https://api.letterboxd.com', 'oauth-code', ['apiKey', 'secretKey'], '/films', undefined, ['accessToken']),
  D('goodreads', 'Goodreads', 'reviews', 'https://www.goodreads.com', 'api-key-header', ['apiKey'], '/search/index.xml', 'key'),
  D('myanimelist', 'MyAnimeList', 'reviews', 'https://api.myanimelist.net', 'oauth-code', ['clientId', 'clientSecret'], '/v2/users/@me'),
];
