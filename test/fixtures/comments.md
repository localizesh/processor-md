## Comments

A one-line comment and a multi-line comment have different syntax. Both are
removed from the web pages that are produced when staging or publishing.

### One line comments

A one-line comment. Hash characters (#) used like this are reserved only for
one-line comments.

    {# Time travel is fun #}

### Multi-line comments

A multi-line comment, with start and end tags surrounding the comment.

    {% comment %}
    Time travel is fun.
    I do it literally all the time.
    {% endcomment %}