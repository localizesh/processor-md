export const AVOID_HTML_TYPE: string = "html!";
export const AVOID_HTML_TAGS: string[] = ["iframe", "html"];

export interface PlaceholderContent {
  content: string;
  contentWithoutTags: string;
  placeholder: string;
  placeholderWithoutTags: string;
  tagName: string;
}

const getTagArray = (str: string, tagName: string): string[] => {
  const regexp: RegExp = new RegExp(`(?:<)(\/?${tagName}.*?)(?=>)`, "g");
  const strItem: string[] = [];

  const matches = str.match(regexp);

  if (matches) {
    for (const match of matches) {
      const tag = match.slice(1);
      strItem.push(tag);
    }
  }

  return strItem;
};

const fetchNestedTags = (str: string, tagName: string): string | null => {
  const closeTagRegExp: RegExp = new RegExp(`</${tagName}>`);
  const openTagRegExp: RegExp = new RegExp(`<${tagName}.*?>`, "m");

  const tagArr: string[] = getTagArray(str, tagName);

  let currentIndex: number = 0;
  let openTagCounter: number = 0;
  let closeTagCounter: number = 0;

  let indexIncrement: number = tagName.length + 2;

  const nestedContent: string = tagArr.reduce((acc, tag) => {
    const isCloseTag = !tag.indexOf("/");

    if (isCloseTag) {
      closeTagCounter++;
      const closeTagIndex: number = str.indexOf(tag, currentIndex);
      currentIndex = closeTagIndex + indexIncrement;
    } else {
      openTagCounter++;
      const openTagIndex: number = str.indexOf(tag, currentIndex);
      currentIndex = openTagIndex + indexIncrement;
    }

    if (openTagCounter === closeTagCounter && !acc) {
      const matchCloseTag: any[] | null = str.match(closeTagRegExp);
      const matchOpenTag: any[] | null = str.match(openTagRegExp);

      if (matchOpenTag && matchCloseTag) {
        acc = str.substr(
          matchOpenTag[0].length,
          currentIndex - matchCloseTag[0].length - matchOpenTag[0].length
        );
        return acc;
      }
    }
    return acc;
  }, "");

  return openTagCounter === closeTagCounter || nestedContent
    ? nestedContent
    : null;
};

export const replaceHtmlBeforeMdast = (
  markdownString: string
): { docWithHtmlPlaceholders: string; contentsAvoidMarkdown: PlaceholderContent[] } => {
  const HTML_SIMPLE_TAG: RegExp =
    /((<(pre|code|html|aside|blockquote|body|dl|details|div|figure|footer|head|header|iframe|main|noscript|object|ol|q|ruby|samp|script|section|style|table|template|ul).*?>)((?:.|\n|\r\n)*?))(<\/\3>)/g;

  const MD_HTML_PLACEHOLDER_: string = "MD_HTML_PLACEHOLDER_";

  const contentsAvoidMarkdown: PlaceholderContent[] = [];
  let markdownStringCopy: string = markdownString;

  let matchedElem;
  let index: number = 0;
  while ((matchedElem = HTML_SIMPLE_TAG.exec(markdownString)) !== null) {
    index++;

    const fullTag: string = matchedElem[0];
    const openTag: string = matchedElem[2];
    const closedTag: string = matchedElem[5];
    const tagName: string = matchedElem[3];
    const tagContent: string = matchedElem[4];

    const openTagRegExp: RegExp = new RegExp(`<${tagName}.*?>`, "m");
    const tagContentMatch: any[] | null = tagContent.match(openTagRegExp);

    if (tagContentMatch) {
      const startTagIndex: number = markdownString.indexOf(fullTag);
      const content: string | null = fetchNestedTags(
        markdownString.slice(startTagIndex, markdownString.length - 1),
        tagName
      );
      if (content === null) {
        return {
          docWithHtmlPlaceholders: markdownString,
          contentsAvoidMarkdown: [],
        };
      }
      const placeholder: string = MD_HTML_PLACEHOLDER_ + index;

      contentsAvoidMarkdown.push({
        placeholder: openTag + placeholder + closedTag,
        placeholderWithoutTags: placeholder,
        content: openTag + content + closedTag,
        contentWithoutTags: content,
        tagName
      });

      markdownStringCopy = markdownStringCopy.replace(content, placeholder);
    } else {
      const placeholder: string = MD_HTML_PLACEHOLDER_ + index;

      contentsAvoidMarkdown.push({
        placeholder: openTag + placeholder + closedTag,
        placeholderWithoutTags: placeholder,
        content: openTag + tagContent + closedTag,
        contentWithoutTags: tagContent,
        tagName
      });

      const isCodeBlockOnMarkDown = defineIsCodeBlock(
        markdownStringCopy,
        fullTag
      );
      if (!isCodeBlockOnMarkDown)
        markdownStringCopy = markdownStringCopy.replace(
          fullTag,
          openTag + placeholder + closedTag
        );
    }
  }

  function defineIsCodeBlock(
    markdownStringCopy: string,
    fullTag: string
  ): boolean {
    const startIndex: number = markdownStringCopy.indexOf(fullTag);
    let searchString: string = markdownStringCopy.slice(
      startIndex - 8,
      startIndex
    );

    const tab = " ".repeat(4);
    const lineBreak = "\n";
    const lineBreakLinux = "\r\n";

    return (
      searchString.trim() === "```" ||
      searchString.trim() === "~~~" ||
      searchString.includes(`${lineBreakLinux}${lineBreakLinux}${tab}`) ||
      searchString.includes(`${lineBreak}${lineBreak}${tab}`)
    );
  }

  return { docWithHtmlPlaceholders: markdownStringCopy, contentsAvoidMarkdown };
};
