
## Sample code

If your contribution contains code, please make sure that it follows the
[Google coding style guide for JavaScript](https://google.github.io/styleguide/javascriptguide.xml).
Otherwise, we will have to ask you to make changes, and that's no fun for anyone.

### Inline code

To indicate a span of code, wrap it with backtick quotes (\`). Unlike a
pre-formatted code block, a code span indicates code within a normal paragraph.
For example:

    Use the `printf()` function.

Will result in:

Use the `printf()` function.

### Code blocks

To produce a code block in Markdown, simply indent every line of the block by
at least 4 spaces or 1 tab. For example, given this input:

    Here is an example of AppleScript:

        tell application "Foo"
            beep
        end tell

will result in:

Here is an example of AppleScript:

    tell application "Foo"
        beep
    end tell

Within a code block, ampersands (`&`) and angle brackets (`<` and `>`) are
automatically converted into HTML entities. This makes it very easy to include
example HTML source code using Markdown -- just paste it and indent it, and
Markdown will handle the hassle of encoding the ampersands and angle brackets.

Warning: Wrapping code blocks in `&amp;&lt;&gt;` is not supported on
DevSite. DevSite will not automatically style these blocks and our integration
tests will fail.

### Highlighting

Use `<strong>` to call attention to content within a `<pre>` block. Doing so
will lighten the surrounding content to emphasize the section highlighted by
the `<strong>` block. For example:

    // ...
    // ...
    // ...
    for (i = 0; i < 10; i++) {
        printf("Counting %d\n", i);

        if (i % 3 == 0) {
            someFunc(i);
        }
    }
    // ...
    // ...
    // ...

<!---->

    <pre class="prettyprint">
    // ...
    // ...
    // ...
    for (i = 0; i < 10; i++) {
        printf("Counting %d\n", i);

        <strong>if (i % 3 == 0) {
            someFunc(i);
        }</strong>
    }
    // ...
    // ...
    // ...
    </pre>

### Click to copy

Click to copy is automatically enabled for all code blocks.

### Special Case: Templates - {{}}

If you need to include templates in your code samples, be sure to escape them.

For example:

    <pre class="prettyprint">
    &lt;polymer-media-query query="max-width:640px" queryMatches="&#123;{isPhone}}">
    </pre>

If it's inline, you'll need to wrap it in a `<code>` block instead of backticks.

    * Declarative two-way data-binding: <code><input id="input" value="&#123;{foo}}"></code>


```header meta some text
  for (i = 0; i < 10; i++) {
      printf("Counting %d\n", i);

        if (i % 3 == 0) {
            someFunc(i);
        }
    }
```

```header
  for (i = 0; i < 10; i++) {
    printf("Counting %d\n", i);
  <em>gfhgfh<em>
        <strong>if (i % 3 == 0) {
            someFunc(i);
        }</strong>
    }
 ```
