# Final Exam Prep Builder

A lightweight browser app to help students upload their own course documents and generate:

- interactive quizzes (multiple choice / fill-in style),
- flashcards,
- cheat sheets,
- study tips.

No backend is required for this first version. Everything runs in-browser and is stored in local storage.

## Features

- Dynamic course creation.
- User-side document upload (`.txt`, `.md`, `.csv`, `.pdf`, `.docx`).
- Automatic text extraction from uploaded files.
- Generated learning outputs based on uploaded material.
- Quiz attempt and instant scoring.
- Persistent data in browser local storage.

## Run

1. Open `index.html` in a modern browser.
2. Create a course.
3. Upload files.
4. Click **Generate Quiz + Flashcards + Cheat Sheet**.

## Notes

- PDF parsing uses `pdf.js` from CDN.
- DOCX parsing uses `mammoth.js` from CDN.
- Generated questions are heuristic/rule-based in this version.

## Next upgrade (public GitHub + multi-user)

To support usage by many users across systems:

1. Add backend auth and database.
2. Store user uploads in cloud storage (S3/Cloudinary).
3. Move document processing to background jobs.
4. Add AI generation using OpenAI/Claude APIs.
5. Deploy frontend and backend publicly (Vercel + Render/Railway).
