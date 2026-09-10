import type { APIRoute } from 'astro';
import { projects } from '../data/projects';
import { site } from '../data/site';

export const GET: APIRoute = () => {
  const urls = ['/', ...projects.map((project) => project.route)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((path) => `\n  <url><loc>${new URL(path, site.origin).href}</loc></url>`)
    .join('')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
