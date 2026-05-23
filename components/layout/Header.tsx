"use client";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="h-14 sm:h-16 border-b border-gold/20 bg-cream/80 backdrop-blur flex items-center px-4 sm:px-8">
      <h1 className="font-serif text-xl sm:text-2xl text-navy tracking-tight truncate">
        {title}
      </h1>
      <div className="ml-3 h-px flex-1 max-w-[80px] bg-gradient-to-r from-gold to-transparent" />
    </header>
  );
}
