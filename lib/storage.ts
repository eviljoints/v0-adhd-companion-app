// lib/storage.ts
import { createClient } from "@/lib/supabase/client"

/** Upload a File to a bucket under /<userId>/<timestamp>-<name> and return its public URL. */
export async function uploadToBucket(
  bucket: string,
  userId: string,
  file: File
): Promise<string> {
  const supabase = createClient()
  const safeName = file.name?.replace(/\s+/g, "-") || "file"
  const path = `${userId}/${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  })
  if (upErr) throw upErr
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** Upload a Blob (voice) and return public URL. */
export async function uploadVoiceBlob(
  bucket: string,
  userId: string,
  blob: Blob,
  ext = "webm"
): Promise<string> {
  const supabase = createClient()
  const path = `${userId}/${Date.now()}-voice.${ext}`
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: blob.type || `audio/${ext}`,
  })
  if (upErr) throw upErr
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** Parse a Supabase public URL -> { bucket, path } or null if not parseable. */
export function parsePublicUrl(publicUrl: string): { bucket: string; path: string } | null {
  // Matches .../object/public/<bucket>/<path...>
  const m = publicUrl.match(/\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  return { bucket: m[1], path: m[2] }
}

/** Delete a file by its *public* URL. No-op if cannot parse. */
export async function removeByPublicUrl(publicUrl: string): Promise<boolean> {
  const supabase = createClient()
  const parsed = parsePublicUrl(publicUrl)
  if (!parsed) return false
  const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path])
  if (error) throw error
  return true
}
