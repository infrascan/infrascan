import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Infrascan Docs",
  tagline: "Guides and reference for Infrascan",
  favicon: "img/logo.svg",

  // Set the production url of your site here
  url: "https://infrascan.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Infrascan", // Usually your GitHub org/user name.
  projectName: "Infrascan", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/infrascan/infrascan/tree/main/docs",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: "img/docusaurus-social-card.jpg",
    navbar: {
      title: "Infrascan",
      logo: {
        alt: "Infrascan Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/infrascan/infrascan",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Overview",
              to: "/docs/overview",
            },
            {
              label: "Getting Started",
              to: "/docs/getting-started",
            },
            {
              label: "Core Packages",
              to: "/docs/@infrascan/sdk",
            },
            {
              label: "AWS Scanners",
              to: "/docs/@infrascan/aws",
            },
            {
              label: "Connectors",
              to: "/docs/@infrascan/s3-connector",
            },
            {
              label: "Plugins",
              to: "/docs/@infrascan/node-reducer-plugin",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "Github",
              href: "https://github.com/infrascan/infrascan",
            },
            {
              label: "Twitter / X",
              href: "https://x.com/infrascanio",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Infrascan Ltd.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
