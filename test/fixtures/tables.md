## Tables

Tables are supported with standard markup. Here's a typical table with a
heading row, several regular rows, and a row marked up as `<tr class="alt">`,
which produces a darker background that can be used as an alternate header.

| One                                    | Two | Three |
| -------------------------------------- | --- | ----- |
| 1.0                                    | 2.0 | 3.0   |
| 1.1                                    | 2.1 | 3.1   |
| Here come some numbers that end in .2! |     |       |
| 1.2                                    | 2.2 | 3.2   |

    <table>
      <tr><th>One</th><th>Two</th><th>Three</th></tr>
      <tr><td>1.0</td><td>2.0</td><td>3.0</td></tr>
      <tr><td>1.1</td><td>2.1</td><td>3.1</td></tr>
      <tr class="alt"><td colspan="3">Here come some numbers that end in .2!</td></tr>
      <tr><td>1.2</td><td>2.2</td><td>3.2</td></tr>
    </table>

### Responsive tables

To make a table responsive, add the `responsive` class to the table.

| Parameters       |                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------- |
| `value`          | `String` the choice's value, which respondents see as a label when viewing the form |
| `navigationType` | `PageNavigationType` the choice's navigation type                                   |

*   There must be ***only two columns*** in the table: the first column for the things being defined (the key), and the second column for all information about that key, in multiple lines if necessary. This two-column restriction means that responsive tables cannot be used for truly two-dimensional tabular data, checkmark-based feature comparison, but they are well suited for reference information (or anything other data that could reasonably be expressed by a definition list instead of a table).
*   If there are multiple lines of information about the key — say, a type and a description — wrap each line in `<p>` to force line breaks (instead of `<br>`).
*   There must be only one cell in the header row. Use `<th colspan="2">` to force it to span both columns. To remind you of this behavior, we automatically hides any `<th>` after the first (which intentionally looks very broken).

<!---->

    <table class="responsive">
      <tbody>
        <tr>
          <th colspan=2>Parameters</th>
        </tr>
        <tr>
          <td>
            <code>value</code>
          </td>
          <td>
            <code>String</code><br>
            the choice's value, which respondents see as a label when viewing the form
          </td>
        </tr>
        <tr>
          <td>
            <code>navigationType</code>
          </td>
          <td>
            <code>
              <a href="#">PageNavigationType</a>
            </code>
            <br>the choice's navigation type
          </td>
        </tr>
      </tbody>
    </table>

### Invisible tables

You can arrange text in columns, or otherwise make a table invisible, using
`<table class="columns">...</table>`. This is typically used for arranging
long narrow lists.

|                              |                                   |                                 |
| ---------------------------- | --------------------------------- | ------------------------------- |
| `auto` `break` `case` `char` | `const` `continue` `default` `do` | `double` `else` `enum` `extern` |

    <table class="columns">
      <tr>
        <td>
          <code>auto</code><br />
          <code>break</code><br />
          <code>case</code><br />
          <code>char</code>
        </td>
        <td>
          <code>const</code><br />
          <code>continue</code><br />
          <code>default</code><br />
          <code>do</code>
        </td>
        <td>
          <code>double</code><br />
          <code>else</code><br />
          <code>enum</code><br />
          <code>extern</code>
        </td>
      </tr>
    </table>
