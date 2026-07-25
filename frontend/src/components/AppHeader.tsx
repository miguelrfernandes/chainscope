"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Navbar, NavbarBrand, NavbarContent, NavbarItem, Button } from "@heroui/react";

import { Logomark } from "./Logomark";

export type AppHeaderProps = {
  activePage?: "landing" | "app";
  rightContent?: React.ReactNode;
};

export function AppHeader({ activePage = "landing", rightContent }: AppHeaderProps) {
  return (
    <div className="w-full px-4 pt-3 pb-1">
      <Navbar
        maxWidth="full"
        position="static"
        className="mx-auto max-w-5xl rounded-full border border-white/10 bg-[#070a09]/80 px-4 py-1 backdrop-blur-xl shadow-2xl transition-all"
        classNames={{
          wrapper: "max-w-full px-2 h-12 flex items-center justify-between",
        }}
      >
        <NavbarBrand className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-90">
            <motion.div whileHover={{ rotate: 12 }} transition={{ type: "spring", stiffness: 300 }}>
              <Logomark className="h-6 w-6 text-[var(--accent)] drop-shadow-[0_0_8px_rgba(255,180,84,0.4)]" />
            </motion.div>
            <span className="text-lg leading-none">
              <span className="font-[family-name:var(--font-fraunces)] italic text-[var(--ink)] font-semibold">
                Chain
              </span>
              <span className="font-medium tracking-wide text-[var(--accent)]">
                Scope
              </span>
            </span>
          </Link>
        </NavbarBrand>

        <NavbarContent justify="end" className="gap-3">
          {rightContent ? (
            <NavbarItem>{rightContent}</NavbarItem>
          ) : (
            activePage === "landing" && (
              <NavbarItem>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    as={Link}
                    href="/app"
                    color="primary"
                    variant="solid"
                    radius="full"
                    size="sm"
                    className="font-mono text-xs font-semibold text-[var(--accent-ink)] bg-[var(--accent)] shadow-[0_0_15px_rgba(255,180,84,0.25)] hover:shadow-[0_0_25px_rgba(255,180,84,0.4)] px-4 py-1.5 rounded-full"
                  >
                    Launch App →
                  </Button>
                </motion.div>
              </NavbarItem>
            )
          )}
        </NavbarContent>
      </Navbar>
    </div>
  );
}
