"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Camera, Upload, X, ImageIcon, Edit3, RotateCw, ZoomIn, ZoomOut } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  onImageSelect: (file: File, preview: string) => void
  onImageRemove: () => void
  currentImage?: string
  className?: string
  maxSize?: number // in MB
  accept?: string
  allowMultiple?: boolean
  allowCamera?: boolean
  allowEditing?: boolean
}

export function ImageUpload({
  onImageSelect,
  onImageRemove,
  currentImage,
  className,
  maxSize = 5,
  accept = "image/*",
  allowMultiple = false,
  allowCamera = true,
  allowEditing = true,
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingImage, setEditingImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setError(null)

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      setError(`File size must be less than ${maxSize}MB`)
      return
    }

    // Create preview URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = e.target?.result as string
      if (allowEditing) {
        setEditingImage(preview)
        setIsEditing(true)
      } else {
        onImageSelect(file, preview)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  const openCamera = () => {
    cameraInputRef.current?.click()
  }

  const handleEditComplete = (editedImageUrl: string) => {
    // Convert data URL to File
    fetch(editedImageUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], "edited-image.jpg", { type: "image/jpeg" })
        onImageSelect(file, editedImageUrl)
        setIsEditing(false)
        setEditingImage(null)
      })
  }

  if (currentImage) {
    return (
      <Card className={cn("relative overflow-hidden", className)}>
        <CardContent className="p-0">
          <div className="relative group">
            <img src={currentImage || "/placeholder.svg"} alt="Attachment" className="w-full h-48 object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {allowEditing && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingImage(currentImage)
                    setIsEditing(true)
                  }}
                  className="absolute top-2 left-2"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={onImageRemove} className="absolute top-2 right-2">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="h-8 w-8 text-gray-400" />
            <Upload className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-600 mb-2">Click to upload or drag and drop</p>
          <p className="text-xs text-gray-500 mb-3">PNG, JPG, GIF up to {maxSize}MB</p>

          {allowCamera && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openCamera()
                }}
                className="flex items-center gap-1"
              >
                <Camera className="h-4 w-4" />
                Camera
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openFileDialog()
                }}
                className="flex items-center gap-1"
              >
                <Upload className="h-4 w-4" />
                Gallery
              </Button>
            </div>
          )}

          {error && (
            <Badge variant="destructive" className="mt-2">
              {error}
            </Badge>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={allowMultiple}
        onChange={handleChange}
        className="hidden"
      />

      {allowCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="hidden"
        />
      )}

      {/* Image Editor Dialog */}
      {allowEditing && (
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Edit Image</DialogTitle>
            </DialogHeader>
            {editingImage && (
              <ImageEditor
                imageUrl={editingImage}
                onSave={handleEditComplete}
                onCancel={() => {
                  setIsEditing(false)
                  setEditingImage(null)
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

interface ImageEditorProps {
  imageUrl: string
  onSave: (editedImageUrl: string) => void
  onCancel: () => void
}

function ImageEditor({ imageUrl, onSave, onCancel }: ImageEditorProps) {
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const applyFilters = () => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight

    // Apply transformations
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
    ctx.restore()
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    applyFilters()
    const editedImageUrl = canvas.toDataURL("image/jpeg", 0.9)
    onSave(editedImageUrl)
  }

  return (
    <div className="space-y-4">
      <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: "300px" }}>
        <img
          ref={imageRef}
          src={imageUrl || "/placeholder.svg"}
          alt="Edit preview"
          className="w-full h-full object-contain"
          style={{
            transform: `rotate(${rotation}deg) scale(${scale})`,
            filter: `brightness(${brightness}%) contrast(${contrast}%)`,
            transition: "all 0.2s ease",
          }}
          onLoad={applyFilters}
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Edit Controls */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Rotate</label>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setRotation((prev) => prev - 90)}>
                <RotateCw className="h-4 w-4 transform scale-x-[-1]" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRotation((prev) => prev + 90)}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Zoom</label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScale((prev) => Math.max(0.5, prev - 0.1))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScale((prev) => Math.min(2, prev + 0.1))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Brightness</label>
            <input
              type="range"
              min="50"
              max="150"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Contrast</label>
            <input
              type="range"
              min="50"
              max="150"
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1 bg-transparent">
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} className="flex-1">
          Save Changes
        </Button>
      </div>
    </div>
  )
}

interface ImageDisplayProps {
  src: string
  alt: string
  className?: string
  showRemove?: boolean
  onRemove?: () => void
  showFullscreen?: boolean
}

export function ImageDisplay({
  src,
  alt,
  className,
  showRemove = false,
  onRemove,
  showFullscreen = true,
}: ImageDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <>
      <div
        className={cn("relative group cursor-pointer", className)}
        onClick={() => showFullscreen && setIsFullscreen(true)}
      >
        <img src={src || "/placeholder.svg"} alt={alt} className="w-full h-32 object-cover rounded-lg border" />
        {showRemove && onRemove && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
          {showFullscreen && <ZoomIn className="h-6 w-6 text-white" />}
        </div>
      </div>

      {/* Fullscreen Dialog */}
      {showFullscreen && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0">
            <div className="relative">
              <img src={src || "/placeholder.svg"} alt={alt} className="w-full h-auto max-h-[80vh] object-contain" />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => setIsFullscreen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

interface MultiImageUploadProps {
  onImagesSelect: (files: File[], previews: string[]) => void
  onImageRemove: (index: number) => void
  currentImages?: string[]
  className?: string
  maxImages?: number
  maxSize?: number
}

export function MultiImageUpload({
  onImagesSelect,
  onImageRemove,
  currentImages = [],
  className,
  maxImages = 5,
  maxSize = 5,
}: MultiImageUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList) => {
    setError(null)

    if (currentImages.length + files.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`)
      return
    }

    const validFiles: File[] = []
    const previews: string[] = []
    let processedCount = 0

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files")
        return
      }

      if (file.size > maxSize * 1024 * 1024) {
        setError(`File size must be less than ${maxSize}MB`)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const preview = e.target?.result as string
        validFiles.push(file)
        previews.push(preview)
        processedCount++

        if (processedCount === files.length) {
          onImagesSelect(validFiles, previews)
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  return (
    <div className={className}>
      {/* Current Images Grid */}
      {currentImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {currentImages.map((image, index) => (
            <ImageDisplay
              key={index}
              src={image || "/placeholder.svg"}
              alt={`Attachment ${index + 1}`}
              showRemove={true}
              onRemove={() => onImageRemove(index)}
              className="aspect-square"
            />
          ))}
        </div>
      )}

      {/* Upload Area */}
      {currentImages.length < maxImages && (
        <Card
          className={cn(
            "border-2 border-dashed transition-colors cursor-pointer",
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400",
          )}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragActive(false)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-6 px-4 text-center">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon className="h-6 w-6 text-gray-400" />
              <Upload className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 mb-1">Add more images</p>
            <p className="text-xs text-gray-500">
              {currentImages.length}/{maxImages} images
            </p>
            {error && (
              <Badge variant="destructive" className="mt-2">
                {error}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleChange} className="hidden" />
    </div>
  )
}
