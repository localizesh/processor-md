## Callouts

Note: This type of callout is an ordinary note or tip.

Caution: This type of callout suggests proceeding with caution.

Warning: This type of callout is stronger than a Caution; it means "Don't do this."

Success: This type of callout describes a successful action or an error-free status. Used only in interactive or dynamic content; don't use in ordinary static pages.

Key Point: This type of callout defines an important concept.

Key Term: This type of callout defines important terminology.

Objective: This type of callout defines the goal of a procedure.

Dogfood: This type of callout is for notes that apply temporarily during internal dogfood testing. Remove all Dogfood callouts before making a document publicly visible.

## Comparisons

Not recommended — indent with tabs

    (bad sample code)

Recommended — indent with spaces

    (good sample code)

Not allowed — indent with spaces

    (very bad sample code)


## External links

To mark a link as external, use
`<a href="https://www.google.com/" class="external">External Link</a>` when
authoring in HTML, or append `{: .external}` to links when authoring in
Markdown.

[External Link](https://www.google.com/)

## Custom attributes and named anchors

Markdown supports custom markup attributes for block level HTML elements and
headers.

The format for this allows for a custom class, a custom ID, and/or custom
attribute/value pairs in the same statement:

    This is a paragraph.
    {: .customClass #custom_id attribute='value' }

This generates this HTML:

    <p class="customClass" id="custom_id" attribute="value">This is a paragraph.</p>

### Custom attributes on headers

As headers can only be defined in one line, the attributes list should be
defined at the end of the header definition:

    ## Header with custom ID {: #custom_id }

Generates:

    <h2 id="custom_id">Header with custom ID</h2>

## Block quote

    > Lorem ipsum dolor sit amet, consectetur adipiscing elit.

> Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Tooltips

Any element that has a `title` attribute will show a tooltip (with the value
of the attribute) on mouseover. For example: "...someday screen
PPI may increase further..."
(note that the dotted underline comes from the abbr element, not the tooltip).

    ...someday screen <abbr title="pixels per inch">PPI</abbr> may increase further...

Warning: Be sure to use tooltips only for supplemental information—not essential text or primary user-experience features—since the presence of tooltips is not obvious and users on mobile devices will not see them at all.

## Miscellaneous classes

Use `class="inline"`, `class="inline-block"`, and `class="block"` to force
inline, inline-block, or block layout, in the rare cases when it is necessary.

Use `class="clearfix"` to clear a floated element, for example after using
`attempt-left` or `attempt-right`.



