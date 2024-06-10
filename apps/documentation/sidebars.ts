import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

import { readdirSync, readFileSync } from "node:fs";
import frontMatter from "front-matter";

interface Section {
  type: "category";
  label: string;
  items: string[];
}

function buildSidebarSectionsFromDir(path: string): Section[] {
  const files = readdirSync(`./docs/${path}`);
  const sections: Record<string, string[]> = {};
  for (const file of files) {
    const filepath = `${path}/${file}/README`;
    const projectReadme = readFileSync(`./docs/${filepath}.md`, "utf8");
    const parsedFrontMatter = frontMatter<{ title: string; category: string }>(
      projectReadme,
    );
    if (sections[parsedFrontMatter.attributes.category] == null) {
      sections[parsedFrontMatter.attributes.category] = [];
    }
    sections[parsedFrontMatter.attributes.category].push(filepath);
  }
  return Object.entries(sections).map(([label, items]) => ({
    type: "category",
    label,
    items,
  }));
}

const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  docSidebar: [
    "overview",
    "getting-started",
    ...buildSidebarSectionsFromDir("@infrascan"),
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;
