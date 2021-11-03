# Markdown syntax

Web**Fundamental** provides a wide variety of styled elements and CSS
classes to use in documentation. Although you may supplement these styles with
custom CSS, you should only use custom CSS when strictly necessary. If you
find that you need to create a new style that will apply to more than a
single page, please file an issue on GitHub so that other pages can use it
as well. This ensures site-wide consistency.

Note: This document is meant to supplement the [Google's developer
documentation style guide](/style/). If there are differences, the
official style guide takes precedence unless otherwise specified.

## Headings

The top-most heading of the page is the page's title. The page body must not
contain another level 1 heading, to avoid confusing non-visual browsers.

**When should I capitalize headings?**

Use [sentence case](/style/capitalization#capitalization-in-titles-and-headings),
for **all** titles, and section headings.

Yes, we're inconsistent about this, but we're trying to fix it, please do your
best to adhere to these guidelines.

## Heading 2

Caution: If you plan to link to specific headings
[<`a href="#heading-what-what"`>](#heading-what-what) within your document,
it is **strongly** recommended you define them yourself with the
`{: #anchor-name }` syntax. This ensures that when documents are localized,
the anchor will still work, but also ensures that any difference between
Markdown processors are a non-issue.

### Heading 3

DevSite will automatically add `<h2>` and `<h3>` elements
to the table of contents. To keep one from being added (like these two here,
which do not appear in the table of contents), apply `class="hide-from-toc"`.
You can also put an `<h2>` or `<h3>` inside a table header (`<th>`) to force
the table into the table of contents. Inside a table header, `<h2>` and `<h3>`
are styled like regular text, so readers won't be able to tell.

#### Heading 4

##### Heading 5

###### Heading 6

    ## Heading 2
    ### Heading 3
    #### Heading 4
    ##### Heading 5
    ###### Heading 6