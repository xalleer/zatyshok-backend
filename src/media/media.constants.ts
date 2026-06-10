export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const MAX_FILES_PER_REQUEST = 10;

export const CLOUDINARY_FOLDER = {
  PROPERTY: 'zatyshok/properties',
  UNIT: 'zatyshok/units',
} as const;
