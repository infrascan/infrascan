// @ts-check
import { MarkdownPageEvent } from "typedoc-plugin-markdown";

/**
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
  app.renderer.on(
    MarkdownPageEvent.BEGIN,
    /** @param {import('typedoc-plugin-markdown').MarkdownPageEvent} page */
    (page) => {
      page.frontmatter = {
        title: page.model.name,
        // spread the existing frontmatter
        ...page.frontmatter,
      };
    },
  );
}
