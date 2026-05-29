"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { useCallback, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image as ImageIcon,
  Undo,
  Redo,
  Highlighter,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

type HeadingLevel = 1 | 2 | 3;

export default function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing your blog post…",
}: RichTextEditorProps) {
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      ImageExtension.configure({
        HTMLAttributes: { class: "rich-text-img" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const insertImageFromUrl = useCallback(() => {
    if (!imageUrl.trim() || !editor) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageUrl("");
    setShowImagePanel(false);
  }, [imageUrl, editor]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      setUploading(true);
      setUploadError(null);
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `blog/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage
        .from("blog-images")
        .upload(path, file);
      if (error) {
        setUploadError(error.message);
      } else if (data) {
        const { data: urlData } = supabase.storage
          .from("blog-images")
          .getPublicUrl(data.path);
        editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
        setShowImagePanel(false);
      }
      setUploading(false);
      e.target.value = "";
    },
    [editor]
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-navy text-cream"
          : "text-ink-soft hover:bg-cream-200 hover:text-navy"
      }`}
    >
      {children}
    </button>
  );

  const headingValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
    ? "h3"
    : "p";

  return (
    <div className="border border-gold/30 rounded-md overflow-visible bg-white shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2.5 py-2 border-b border-gold/20 bg-cream-100">
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo size={14} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo size={14} />
        </Btn>
        <div className="w-px h-4 bg-gold/30 mx-1" />

        {/* Style dropdown */}
        <select
          value={headingValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") {
              editor.chain().focus().setParagraph().run();
            } else {
              editor
                .chain()
                .focus()
                .setHeading({ level: parseInt(v[1]) as HeadingLevel })
                .run();
            }
          }}
          className="text-xs border border-gold/30 rounded px-2 py-1 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <div className="w-px h-4 bg-gold/30 mx-1" />

        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive("highlight")}
          title="Highlight"
        >
          <Highlighter size={14} />
        </Btn>
        <div className="w-px h-4 bg-gold/30 mx-1" />

        <Btn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight size={14} />
        </Btn>
        <div className="w-px h-4 bg-gold/30 mx-1" />

        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered size={14} />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <Quote size={14} />
        </Btn>
        <div className="w-px h-4 bg-gold/30 mx-1" />

        <Btn onClick={setLink} active={editor.isActive("link")} title="Insert link">
          <Link2 size={14} />
        </Btn>

        {/* Image button + panel */}
        <div className="relative">
          <Btn
            onClick={() => {
              setShowImagePanel((p) => !p);
              setUploadError(null);
            }}
            active={showImagePanel}
            title="Insert image"
          >
            <ImageIcon size={14} />
          </Btn>

          {showImagePanel && (
            <div className="absolute top-full left-0 mt-1.5 z-20 bg-white border border-gold/30 rounded-xl shadow-xl p-3.5 w-80">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                  Insert Image
                </p>
                <button
                  type="button"
                  onClick={() => setShowImagePanel(false)}
                  className="text-ink-mute hover:text-ink p-0.5 rounded"
                >
                  <X size={14} />
                </button>
              </div>

              {/* File upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full mb-3 px-3 py-2.5 border-2 border-dashed border-gold/40 rounded-lg text-sm text-ink-mute hover:border-gold hover:text-navy transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ImageIcon size={15} className="text-gold" />
                {uploading ? "Uploading…" : "Upload from computer"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {uploadError && (
                <p className="text-xs text-burgundy mb-2">{uploadError}</p>
              )}

              <div className="flex items-center gap-2 text-xs text-ink-mute mb-2.5">
                <div className="flex-1 h-px bg-gold/20" />
                <span>or paste URL</span>
                <div className="flex-1 h-px bg-gold/20" />
              </div>

              <div className="flex gap-1.5">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="flex-1 text-xs border border-gold/30 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold"
                  onKeyDown={(e) => e.key === "Enter" && insertImageFromUrl()}
                />
                <button
                  type="button"
                  onClick={insertImageFromUrl}
                  className="px-3 py-1.5 bg-navy text-cream text-xs rounded-md hover:bg-navy-500 transition-colors"
                >
                  Insert
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
