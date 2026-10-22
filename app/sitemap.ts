import type { MetadataRoute } from "next";

import { cacheLife } from "next/cache";

import {
  listPublicInquirySitemapEntries,
  type PublicInquirySitemapEntry,
} from "@/features/inquiries/queries";

import { absoluteUrl } from "@/lib/seo/site";



/** Static marketing and legal routes. Dynamic service URLs are added below. */

const staticPages = [

  {

    changeFrequency: "weekly" as const,

    path: "/",

    priority: 1,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/pricing",

    priority: 0.8,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions",

    priority: 0.7,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/inquiries",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/quotes",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/follow-ups",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/ai",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/invoices",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/features/analytics",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/contractors-home-services",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/professional-it-services",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/creative-marketing",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/photo-video",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/events-rentals",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/solutions/custom-fabrication-signage",

    priority: 0.6,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/about",

    priority: 0.5,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/compare/spreadsheets",

    priority: 0.5,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/compare/job-management-software",

    priority: 0.5,

  },

  {

    changeFrequency: "monthly" as const,

    path: "/guides/inquiry-to-accepted-quote",

    priority: 0.5,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/security",

    priority: 0.3,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/legal/dpa",

    priority: 0.2,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/subprocessors",

    priority: 0.2,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/privacy",

    priority: 0.2,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/terms",

    priority: 0.2,

  },

  {

    changeFrequency: "yearly" as const,

    path: "/refund-policy",

    priority: 0.2,

  },

] as const;



/** Regenerate sitemap periodically; dynamic URLs also refresh on each build of this route. */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  const lastModified = new Date();

  const rootUrl = absoluteUrl("/");



  const staticEntries: MetadataRoute.Sitemap = staticPages.map((page) => {

    const url = absoluteUrl(page.path);

    const entry: MetadataRoute.Sitemap[number] = {

      changeFrequency: page.changeFrequency,

      lastModified,

      priority: page.priority,

      url,

    };



    if (url === rootUrl) {

      // Root entry advertises the site-wide social preview so crawlers

      // can associate `/` with the OG image (R4 AC 5).

      entry.images = [absoluteUrl("/opengraph-image")];

    }



    return entry;

  });



  let inquiryRows: PublicInquirySitemapEntry[];
  try {
    inquiryRows = await listPublicInquirySitemapEntries();
  } catch (error) {
    // Database-tolerant sitemap: a transient database failure must not take
    // down /sitemap.xml (or the build prerendering it). Serve the static
    // entries; inquiry URLs return on the next revalidation or rebuild.
    console.error("Failed to load public inquiry sitemap entries.", error);
    return staticEntries;
  }



  const inquiryEntries: MetadataRoute.Sitemap = inquiryRows.map((row) => ({

    changeFrequency: "weekly",

    lastModified: row.lastModified,

    priority: 0.6,

    url: absoluteUrl(row.pathname),

  }));



  return [...staticEntries, ...inquiryEntries];

}


