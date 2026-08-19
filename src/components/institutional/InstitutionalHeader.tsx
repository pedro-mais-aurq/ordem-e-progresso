"use client";

import Link from "next/link";
import { useState } from "react";
import { SchoolBrand } from "@/src/components/brand/SchoolBrand";

const navigation = [
  { label: "Quem somos", href: "#quem-somos" },
  { label: "A escola", href: "#escola" },
  { label: "Plataforma Ordem", href: "#plataforma-ordem" },
  { label: "Contato", href: "#contato" },
];

export function InstitutionalHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="institutional-header" id="inicio">
      <div className="institutional-container institutional-header__content">
        <Link className="brand" href="/" aria-label="Página inicial da Escola Estadual Ordem e Progresso">
          <SchoolBrand />
        </Link>

        <button
          className="menu-toggle"
          type="button"
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isOpen}
          aria-controls="institutional-navigation"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span />
          <span />
        </button>

        <nav
          className={`institutional-nav${isOpen ? " institutional-nav--open" : ""}`}
          id="institutional-navigation"
          aria-label="Navegação institucional"
        >
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setIsOpen(false)}>
              {item.label}
            </a>
          ))}
          <Link className="button button--header" href="/plataforma" onClick={() => setIsOpen(false)}>
            Acessar plataforma
          </Link>
        </nav>
      </div>
    </header>
  );
}
