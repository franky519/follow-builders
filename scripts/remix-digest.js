#!/usr/bin/env node

import { readFile } from 'fs/promises';

function getArgValue(flag) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

async function readInput() {
  const file = getArgValue('--file');
  if (file) {
    return readFile(file, 'utf-8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function trimText(text, maxChars) {
  if (!text || typeof text !== 'string') return '';
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Truncated for prompt size]`;
}

function isValidUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

function normalizePayload(payload) {
  const maxTweetsPerBuilder = Number(process.env.MAX_TWEETS_PER_BUILDER || 2);
  const maxPodcastTranscriptChars = Number(
    process.env.PODCAST_TRANSCRIPT_MAX_CHARS || 18000
  );
  const maxBlogContentChars = Number(
    process.env.BLOG_CONTENT_MAX_CHARS || 12000
  );

  const x = (payload.x || [])
    .map((person) => ({
      name: person.name,
      handle: person.handle,
      bio: person.bio || '',
      tweets: (person.tweets || [])
        .filter((tweet) => isValidUrl(tweet.url))
        .slice(0, maxTweetsPerBuilder)
        .map((tweet) => ({
          text: tweet.text || '',
          createdAt: tweet.createdAt || null,
          url: tweet.url,
          likes: tweet.likes || 0,
          retweets: tweet.retweets || 0,
          replies: tweet.replies || 0
        }))
    }))
    .filter((person) => person.tweets.length > 0);

  const podcasts = (payload.podcasts || [])
    .filter((item) => isValidUrl(item.url))
    .map((item) => ({
      name: item.name,
      title: item.title,
      publishedAt: item.publishedAt || null,
      url: item.url,
      transcript: trimText(item.transcript || '', maxPodcastTranscriptChars)
    }));

  const blogs = (payload.blogs || [])
    .filter((item) => isValidUrl(item.url))
    .map((item) => ({
      name: item.name,
      title: item.title,
      publishedAt: item.publishedAt || null,
      author: item.author || '',
      url: item.url,
      description: item.description || '',
      content: trimText(item.content || '', maxBlogContentChars)
    }));

  return {
    generatedAt: payload.generatedAt || null,
    config: payload.config || {},
    stats: payload.stats || {},
    x,
    podcasts,
    blogs,
    errors: payload.errors || []
  };
}

function buildLanguageRule(language) {
  switch (language) {
    case 'zh':
      return 'Output the final digest in Chinese only.';
    case 'bilingual':
      return 'Output the final digest in bilingual format: Chinese first, then English for each item.';
    case 'en':
    default:
      return 'Output the final digest in English only.';
  }
}

function buildSystemPrompt(payload) {
  const prompts = payload.prompts || {};
  const language = payload?.config?.language || 'en';

  return [
    'You are the automated editor for Follow Builders email digests.',
    buildLanguageRule(language),
    'Hard requirements:',
    '- Use only the JSON payload you receive. Do not browse, infer external facts, or fabricate content.',
    '- Keep the original source URLs in the final digest. If an item has no valid URL, omit it.',
    '- Return Markdown email body only. Do not output JSON. Do not explain your process.',
    '- Structure the digest so it is easy to read on mobile email clients.',
    '- Start with a clear title line using the digest date.',
    '- Add a short "今日重点" or "Top Takeaways" section before the detailed sections.',
    '- Omit empty sections instead of writing placeholders.',
    '- Preserve product names, numbers, and source attributions when the payload contains them.',
    '',
    'Follow these reference prompts from the original Follow Builders project when useful:',
    `[digest_intro]\n${prompts.digest_intro || ''}`,
    `[summarize_tweets]\n${prompts.summarize_tweets || ''}`,
    `[summarize_podcast]\n${prompts.summarize_podcast || ''}`,
    `[summarize_blogs]\n${prompts.summarize_blogs || ''}`,
    `[translate]\n${prompts.translate || ''}`
  ].join('\n');
}

function buildUserPrompt(payload) {
  const normalized = normalizePayload(payload);
  return [
    'Create the final email digest from this payload.',
    'If the configured language is bilingual, make each bullet Chinese first and English second.',
    'For X / builder updates, keep each builder concise and prioritize the most informative items.',
    'For podcasts and blogs, explain the core ideas clearly enough that the reader can decide whether to click through.',
    'Place every source URL on its own line so email clients can auto-link it.',
    '',
    JSON.stringify(normalized, null, 2)
  ].join('\n');
}

async function requestDigest(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL;

  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  if (!model) throw new Error('OPENAI_MODEL is missing');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const output = data?.choices?.[0]?.message?.content?.trim();
  if (!output) {
    throw new Error('LLM returned empty content');
  }

  return output;
}

async function main() {
  const raw = await readInput();
  if (!raw || !raw.trim()) {
    throw new Error('No input JSON received');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON input: ${err.message}`);
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(payload) },
    { role: 'user', content: buildUserPrompt(payload) }
  ];

  const digest = await requestDigest(messages);
  console.log(digest);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
