export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const blacklist = parseBlacklist(url.searchParams.get('blacklist') || '');

  if (!query) {
    return Response.json({ results: [] });
  }

  const searches = [
    fetchYouTube(query, env.YOUTUBE_API_KEY),
    fetchVimeo(query, env.VIMEO_ACCESS_TOKEN),
    fetchDailymotion(query)
  ];

  const [youtube, vimeo, dailymotion] = await Promise.allSettled(searches);

  const results = [
    ...(youtube.status === 'fulfilled' ? youtube.value : []),
    ...(vimeo.status === 'fulfilled' ? vimeo.value : []),
    ...(dailymotion.status === 'fulfilled' ? dailymotion.value : [])
  ]
    .filter(item => !matchesBlacklist(item, blacklist))
    .slice(0, 24);

  return Response.json({ results });
}

function parseBlacklist(value) {
  return [...new Set(
    (value || '')
      .split(/[\n,]+/)
      .map(part => part.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function matchesBlacklist(item, blacklist) {
  if (!blacklist.length) return false;

  const haystacks = [
    item.title || '',
    item.description || '',
    item.creator || '',
    item.channel || '',
    item.source || ''
  ]
    .map(str => str.toLowerCase())
    .join(' ');

  return blacklist.some(term => haystacks.includes(term));
}

async function fetchYouTube(query, apiKey) {
  if (!apiKey) return [];

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${apiKey}`
  );

  if (!response.ok) return [];

  const data = await response.json();

  return (data.items || []).map(item => ({
    id: item.id?.videoId || item.id,
    title: item.snippet?.title || 'Untitled',
    description: item.snippet?.description || '',
    creator: item.snippet?.channelTitle || '',
    channel: item.snippet?.channelTitle || '',
    source: 'YouTube',
    url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ''
  }));
}

async function fetchVimeo(query, accessToken) {
  if (!accessToken) return [];

  const response = await fetch(
    `https://api.vimeo.com/videos?query=${encodeURIComponent(query)}&per_page=5`,
    {
      headers: {
        Authorization: `bearer ${accessToken}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4'
      }
    }
  );

  if (!response.ok) return [];

  const data = await response.json();

  return (data.data || []).map(item => {
    const sizes = Array.isArray(item.pictures?.sizes) ? item.pictures.sizes : [];
    const bestImage = [...sizes].sort((a, b) => (b.width || 0) - (a.width || 0))[0];

    return {
      id: item.uri?.split('/').pop() || item.id,
      title: item.name || 'Untitled',
      description: item.description || '',
      creator: item.user?.name || '',
      channel: item.user?.name || '',
      source: 'Vimeo',
      url: item.link || '',
      thumbnail: bestImage?.link || item.thumbnail || ''
    };
  });
}

async function fetchDailymotion(query) {
  const response = await fetch(
    `https://api.dailymotion.com/videos?fields=id,title,description,owner.username,url,thumbnail_360_url&search=${encodeURIComponent(query)}&limit=5&sort=relevance`
  );

  if (!response.ok) return [];

  const data = await response.json();

  return (data.list || []).map(item => ({
    id: item.id,
    title: item.title || 'Untitled',
    description: item.description || '',
    creator: item.owner?.username || '',
    channel: item.owner?.username || '',
    source: 'Dailymotion',
    url: item.url || '',
    thumbnail: item.thumbnail_360_url || ''
  }));
}
