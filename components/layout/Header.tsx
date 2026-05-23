"use client";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="h-16 border-b border-gold/20 bg-cream/80 backdrop-blur flex items-center px-8">
      <h1 className="font-serif text-2xl text-navy tracking-tight">{title}</h1>
      <div className="ml-3 h-px flex-1 max-w-[80px] bg-gradient-to-r from-gold to-transparent" />
    </header>
  );
}
