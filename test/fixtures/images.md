## Images

When adding a caption, wrap images in `<figure>` blocks, and ideally, use
responsive images with the `scrset` attribute when possible. Be sure you
include `alt` attributes for your images as well.

![sample image](https://placehold.it/350x150)

This caption should be used to describe the image.

For example:

    <figure>
      <img src="https://placehold.it/350x150" alt="sample image">
      <figcaption>This caption should be used to describe the image.</figcaption>
    </figure>

Note: Optimized images are served automatically only for `index.yaml` pages,
simply provide a 2x version, and the server will do the rest.

You can apply `class="screenshot"` to an image to give it a border that
offsets it from nearby text. This is typically used for screenshots that have
white backgrounds and otherwise get lost on the page. Don't use it for images
that don't need it.

### Floating images on the right

![Alert dialog](https://placehold.it/350x150)

**Figure 1**: Alert dialog

The image at right also has `class="attempt-right"`, which floats the image
right on larger screens, but forces the image into vertical layout on smaller
screens, tablets and smaller, where floating right would cause problems. Also
available is `class="attempt-left"`. To use `attempt-left` and `attempt-right`
together, make sure the `attempt-left` element comes first.

    <div class="attempt-right">
      <figure>
        <img src="https://placehold.it/350x150" alt="Alert dialog">
        <figcaption><b>Figure 1</b>: Alert dialog</figcaption>
      </figure>
    </div>

Caution: When using `attempt-left` and `attempt-right`, it may be necessary to include a `<div class="clearfix"></div>` block.

### Do and do not images

Add the class `success` or `warning` to the figure caption
to indicate a good or bad example.

![Alert dialog](https://placehold.it/350x150)

**DO**: This is the right thing to do

![Alert dialog](https://placehold.it/350x150)

**DON'T**: This is the wrong thing to do

    <div class="attempt-left">
      <figure>
        <img src="https://placehold.it/350x150" alt="Alert dialog">
        <figcaption class="success">
          <b>DO</b>: This is the right thing to do
         </figcaption>
      </figure>
    </div>
    <div class="attempt-right">
      <figure>
        <img src="https://placehold.it/350x150" alt="Alert dialog">
        <figcaption class="warning">
          <b>DON'T</b>: This is the wrong thing to do
         </figcaption>
      </figure>
    </div>
