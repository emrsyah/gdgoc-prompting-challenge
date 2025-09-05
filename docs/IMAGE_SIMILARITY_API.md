# Image Similarity API

This API endpoint allows you to compare two images and get a similarity score using Google's Gemini AI.

## Endpoint

```
POST /api/decide-similarity
```

## Request

Send a multipart form data request with two image files:

- `original`: The original image file
- `generated`: The generated image file to compare

### Example using curl

```bash
curl -X POST http://localhost:3000/api/decide-similarity \
  -F "original=@original.jpg" \
  -F "generated=@generated.jpg"
```

### Example using JavaScript/fetch

```javascript
const formData = new FormData();
formData.append('original', originalImageFile);
formData.append('generated', generatedImageFile);

const response = await fetch('/api/decide-similarity', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Similarity score:', result.score);
```

## Response

### Success Response (200)

```json
{
  "score": 85,
  "originalImageType": "image/jpeg",
  "generatedImageType": "image/png"
}
```

- `score`: Integer between 0-100 indicating similarity
  - 100 = Identical or nearly identical
  - 0 = Completely different
- `originalImageType`: MIME type of the original image
- `generatedImageType`: MIME type of the generated image

### Error Response (400/500)

```json
{
  "error": "Both original and generated images are required"
}
```

## Supported Image Formats

The API supports common image formats including:
- JPEG/JPG
- PNG
- GIF
- WebP
- BMP

## Environment Variables

Make sure to set the `GEMINI_API_KEY` environment variable with your Google AI Studio API key.

```bash
GEMINI_API_KEY=your_gemini_api_key
```

## Error Handling

The API includes proper error handling for:
- Missing images in the request
- Invalid image formats
- Gemini API errors
- Network issues

All errors return appropriate HTTP status codes and descriptive error messages.
