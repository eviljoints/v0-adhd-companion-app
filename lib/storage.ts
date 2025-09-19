// lib/storage.ts
"use client"

import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export async function uploadToBucket(bucket: string, userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || (file.type.split("/")[1] ?? "bin")
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadVoiceBlob(bucket: string, userId: string, blob: Blob, suggestedExt = "webm"): Promise<string> {
  const file = new File([blob], `note-${Date.now()}.${suggestedExt}`, { type: blob.type || `audio/${suggestedExt}` })
  return uploadToBucket(bucket, userId, file)
}
