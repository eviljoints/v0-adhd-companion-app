"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Play, Pause, Trash2, Download } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceRecorderProps {
  onRecordingComplete?: (audioBlob: Blob, duration: number) => void
  onRecordingRemove?: () => void
  existingRecording?: string | null
  className?: string
}

export function VoiceRecorder({
  onRecordingComplete,
  onRecordingRemove,
  existingRecording,
  className,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(existingRecording || null)
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">("prompt")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Check if audio recording is supported
    setIsSupported("mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (audioUrl && !existingRecording) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl, existingRecording])

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setPermission("granted")
      stream.getTracks().forEach((track) => track.stop()) // Stop the stream immediately
      return true
    } catch (error) {
      console.error("Microphone permission denied:", error)
      setPermission("denied")
      return false
    }
  }

  const startRecording = async () => {
    if (!isSupported) {
      alert("Audio recording is not supported on this device")
      return
    }

    const hasPermission = await requestMicrophonePermission()
    if (!hasPermission) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        })
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)

        if (onRecordingComplete) {
          onRecordingComplete(audioBlob, recordingTime)
        }

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error("Error starting recording:", error)
      alert("Unable to access microphone. Please check your permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const playRecording = () => {
    if (audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl)
        audioRef.current.onended = () => setIsPlaying(false)
      }

      if (isPlaying) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsPlaying(false)
      } else {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  const removeRecording = () => {
    if (audioUrl && !existingRecording) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    setRecordingTime(0)
    setIsPlaying(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (onRecordingRemove) {
      onRecordingRemove()
    }
  }

  const downloadRecording = () => {
    if (audioUrl) {
      const a = document.createElement("a")
      a.href = audioUrl
      a.download = `voice-note-${new Date().toISOString().slice(0, 19)}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardContent className="pt-6 text-center">
          <MicOff className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Voice recording not supported on this device</p>
        </CardContent>
      </Card>
    )
  }

  if (permission === "denied") {
    return (
      <Card className={className}>
        <CardContent className="pt-6 text-center">
          <MicOff className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-3">Microphone access denied</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Refresh to retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Recording Controls */}
          {!audioUrl ? (
            <div className="text-center">
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "w-16 h-16 rounded-full",
                  isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-blue-500 hover:bg-blue-600",
                )}
                disabled={permission === "denied"}
              >
                {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>

              <div className="mt-3">
                {isRecording ? (
                  <div className="space-y-2">
                    <Badge variant="destructive" className="animate-pulse">
                      Recording... {formatTime(recordingTime)}
                    </Badge>
                    <p className="text-xs text-gray-600">Tap to stop recording</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Tap to start voice recording</p>
                )}
              </div>
            </div>
          ) : (
            /* Playback Controls */
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={playRecording}
                  className="flex items-center gap-2 bg-transparent"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? "Pause" : "Play"}
                </Button>

                <Badge variant="secondary">{formatTime(recordingTime)}</Badge>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadRecording}
                  className="flex items-center gap-1 bg-transparent"
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeRecording}
                  className="flex items-center gap-1 text-red-600 hover:text-red-700 bg-transparent"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              </div>

              <p className="text-xs text-center text-gray-600">Voice note recorded successfully</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface VoiceNoteDisplayProps {
  audioUrl: string
  duration?: number
  className?: string
  onRemove?: () => void
}

export function VoiceNoteDisplay({ audioUrl, duration, className, onRemove }: VoiceNoteDisplayProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setIsPlaying(false)
    }

    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className={cn("flex items-center gap-3 p-3 bg-blue-50 rounded-lg border", className)}>
      <Button variant="outline" size="sm" onClick={togglePlay} className="flex items-center gap-2 bg-transparent">
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Voice Note</span>
          {duration && (
            <Badge variant="secondary" className="text-xs">
              {formatTime(duration)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-600">{isPlaying ? "Playing..." : "Tap play to listen"}</p>
      </div>

      {onRemove && (
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-600 hover:text-red-700">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
