"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SchoolBrand } from "@/src/components/brand/SchoolBrand";
import {
  getProfileSections,
  SECTION_DEFINITIONS,
} from "@/src/config/profile-capabilities";
import type { UserProfile } from "@/src/types/academic";

const roleLabels: Record<UserProfile, string> = {
  professor: "Professor",
  coordenacao: "Coordenação",
  aluno: "Aluno",
};

export function PlatformShell({
  profile,
  children,
}: {
  profile: UserProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const basePath = `/plataforma/${profile}`;
  const navigation = [
    { slug: "", label: "Início", glyph: "⌂" },
    ...getProfileSections(profile).map((section) => ({
      slug: section,
      label: SECTION_DEFINITIONS[section].label,
      glyph: SECTION_DEFINITIONS[section].glyph,
    })),
  ];

  return (
    <div className="platform-shell">
      <aside className={`platform-sidebar${isOpen ? " platform-sidebar--open" : ""}`}>
        <div className="platform-brand">
          <SchoolBrand context="platform" theme="dark" />
        </div>

        <nav className="platform-navigation" aria-label={`Menu de ${roleLabels[profile]}`}>
          <span className="platform-navigation__label">Navegação</span>
          {navigation.map((item) => {
            const href = item.slug ? `${basePath}/${item.slug}` : basePath;
            const active = pathname === href;
            return (
              <Link
                href={href}
                key={item.label}
                className={active ? "platform-navigation__item platform-navigation__item--active" : "platform-navigation__item"}
                onClick={() => setIsOpen(false)}
              >
                <span aria-hidden="true">{item.glyph}</span>
                {item.label}
              </Link>
            );
          })}
          <Link
            className="platform-switch-profile platform-switch-profile--sidebar"
            href="/plataforma"
            onClick={() => setIsOpen(false)}
          >
            <span aria-hidden="true">↔</span>
            Trocar perfil
          </Link>
        </nav>

        <div className="platform-sidebar__footer">
          <span className="demo-dot" />
          <span><strong>Ambiente demonstrativo</strong>Dados salvos neste dispositivo</span>
        </div>
      </aside>

      {isOpen && (
        <button className="platform-backdrop" type="button" aria-label="Fechar menu" onClick={() => setIsOpen(false)} />
      )}

      <div className="platform-workspace">
        <header className="platform-topbar">
          <button
            className="platform-menu-button"
            type="button"
            aria-label="Abrir navegação"
            aria-expanded={isOpen}
            onClick={() => setIsOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="platform-topbar__context">
            <span className="platform-topbar__eyebrow">Painel</span>
            <strong>{roleLabels[profile]}</strong>
          </div>
          <div className="platform-topbar__profile-actions">
            <Link className="platform-switch-profile platform-switch-profile--topbar" href="/plataforma">
              Trocar perfil
            </Link>
            <div className="profile-chip" aria-label={`Perfil atual: ${roleLabels[profile]}`}>
              <span>{roleLabels[profile].slice(0, 2).toUpperCase()}</span>
              <div><strong>Perfil demo</strong><small>{roleLabels[profile]}</small></div>
            </div>
          </div>
        </header>

        <main className="platform-content">{children}</main>

        <nav className="platform-bottom-nav" aria-label="Navegação móvel">
          {navigation.map((item) => {
            const href = item.slug ? `${basePath}/${item.slug}` : basePath;
            const active = pathname === href;
            return (
              <Link href={href} key={item.label} className={active ? "is-active" : ""}>
                <span aria-hidden="true">{item.glyph}</span>
                <small>{item.label}</small>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
