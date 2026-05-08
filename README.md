# Finger Paint Smear

A small art program built only with the HTML Canvas 2D API. It lets you paint as if you were smearing wet paint with your finger.

Click to place a round blob of paint on the canvas. Drag with the mouse or touch to pick up nearby colors and pull them along the direction of movement. The paint does not drip like liquid; the goal is a smeared oil-paint or finger-paint texture with visible strokes.

## Files

- `index.html`: Page structure and toolbar
- `style.css`: Layout and simple UI styling
- `script.js`: Canvas drawing, color sampling, and smear behavior
- `README.md`: Project notes

## How to Use

1. Open `index.html` in a browser.
2. Choose a paint color with the color picker.
3. Click or tap the canvas to place a blob of paint.
4. Press and drag to pick up the colors underneath and smear them across the canvas.
5. On Mac, hold the `command` key while dragging to smear only the existing canvas colors without adding new paint.
6. Use `Touch` to switch between the broad, flat `Finger` feel and the streaky `Bristle` feel.
7. Use `Size` to adjust the brush size.
8. Use `Smear` to adjust how far, how strongly, and how densely the colors are dragged.
9. Use `Clear` to reset the canvas to the paper color.
10. Use `Save PNG` to save the current painting as a PNG image.

## Implementation Notes

- No external libraries are used.
- `getImageData()` samples colors around the brush, then redraws those colors as short strokes or translucent ellipses.
- Processing is limited to the brush area to keep the program responsive.
- Pointer Events are used, so both mouse and touch input are supported.
