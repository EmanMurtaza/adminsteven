"use client";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
    </header>
  );
}
