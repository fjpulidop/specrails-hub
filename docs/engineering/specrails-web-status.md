# specrails-web — Estado del Área (Web Engineer)

**Fecha:** 2026-03-19
**Autor:** Web Engineer
**Área:** specrails-web (specrails.dev)

---

## 1. Resumen ejecutivo

specrails-web es el sitio público de marketing y documentación de specrails, desplegado en [specrails.dev](https://specrails.dev). Es una SPA estática (React 18 + TypeScript + Vite + Tailwind CSS, tema Dracula). No tiene backend.

El sitio está **funcionalmente completo** para el estado actual del producto. La prioridad inmediata es alinearlo con el lanzamiento público (Public Launch) una vez que PRD-001 sea aprobado y los cambios de engineering en specrails-core estén implementados.

---

## 2. Estado actual — Lo que está construido

### Landing page (`/`)
| Sección | Estado | Notas |
|---------|--------|-------|
| Hero con terminal animada (npx + git clone) | ✅ Operativo | Dual-terminal con animación typewriter |
| Problem statement | ✅ Operativo | |
| Agents section (12 agentes) | ✅ Operativo | |
| Pipeline section | ✅ Operativo | |
| Demo section | ✅ Operativo | Contenido estático, sin GIFs animados |
| Features section | ✅ Operativo | |
| Install section | ✅ Operativo | Muestra npx + git clone |
| Commands section | ✅ Operativo | |
| Principles section | ✅ Operativo | |
| Roadmap section | ✅ Operativo | Contenido hardcoded, puede divergir |
| Footer | ✅ Operativo | |

### Portal de documentación (`/docs`)
| Doc | Slug | Estado |
|-----|------|--------|
| Overview | `/docs` | ✅ |
| Getting Started | `/docs/getting-started` | ✅ |
| Core Concepts | `/docs/concepts` | ✅ |
| Installation | `/docs/installation` | ✅ |
| Agents | `/docs/agents` | ✅ |
| Workflows | `/docs/workflows` | ✅ |
| Customization | `/docs/customization` | ✅ |
| Updating | `/docs/updating` | ✅ |
| Playbook: Product Discovery | `/docs/playbook-product-discovery` | ✅ |
| Playbook: Parallel Dev | `/docs/playbook-parallel-dev` | ✅ |
| Playbook: OSS Maintainer | `/docs/playbook-oss-maintainer` | ✅ |

### Otras páginas
| Página | Estado |
|--------|--------|
| `/agents` — Agent Comparison Matrix | ✅ Operativo |
| Sidebar de docs con navegación prev/next | ✅ Operativo |
| Mobile-responsive | ✅ Operativo |
| Analytics (Plausible) | ✅ Activo en specrails.dev |
| SEO / Open Graph tags | ✅ Configurado |

---

## 3. Deuda técnica identificada

| Prioridad | Deuda | Impacto |
|-----------|-------|---------|
| **Alta** | Hero CTA principal enlaza a GitHub repo, no a `/docs/getting-started` | El flujo de conversión principal no lleva al usuario al onboarding |
| **Alta** | Hero muestra `git clone` como "Option B" — PRD-001 propone eliminar esta ruta | El sitio quedará desalineado en cuanto PRD-001 se apruebe |
| **Media** | `RoadmapSection` tiene contenido hardcoded | Puede divergir del roadmap real del producto sin que nadie lo note |
| **Media** | `DemoSection` sin contenido animado real | No demuestra el pipeline en acción (issue #22 abierto) |
| **Baja** | Cobertura de tests casi nula | `docs-registry.ts` sin tests; un import roto falla silenciosamente |
| **Baja** | `index.html` en git status como modificado sin contenido — posible artefacto | A investigar |

---

## 4. Gaps que bloquean el Public Launch

Ordenados por impacto:

### G1 — Decisión de PRD-001 (BLOQUEANTE hasta aprobación)
El PRD-001 (CEO aprobación prevista 2026-03-21) define:
- `npx` como **única** ruta de instalación documentada
- Quick Start mode (3 preguntas)
- Comando `specrails doctor`
- Primer task prompt al finalizar setup

**Impacto en web:** El Hero, la sección de Install, y los docs de Getting Started/Installation deben actualizarse en consecuencia. No se puede hacer hasta que PRD-001 esté aprobado.

### G2 — Demo section sin demostración real
El sitio no tiene video ni GIF que muestre el pipeline corriendo. Para un lanzamiento público convincente, se necesita al menos un screencast o GIF del flujo completo (init → /setup → /sr:product-backlog). Issue #22 está abierto.

### G3 — Falta página dedicada de Onboarding post-PRD-001
Actualmente `/docs/getting-started` existe pero necesitará refactoring completo para reflejar el flujo nuevo. Se necesita también alinear `/docs/installation` con el installer refactorizado.

### G4 — Persona Journey Carousel (nice-to-have P1)
Issue #21 abierto. Aumentaría conversión al mostrar el producto desde la perspectiva de diferentes roles. Necesita spec de producto.

---

## 5. Necesidades del equipo de producto (VP Product)

| Necesidad | Urgencia | Descripción |
|-----------|----------|-------------|
| **Aprobación de PRD-001** | Alta — bloquea G1 | Confirmar decisión CEO (sección 9 de PRD-001) para poder actualizar el sitio |
| **Spec de demo/GIF** | Media | ¿Qué flujo mostrar? ¿Quién graba? ¿Formato (GIF/video embed/interactivo)? |
| **Copy del Roadmap público** | Media | ¿Debe la sección de Roadmap en el landing reflejar el Q2 roadmap? ¿O es un roadmap simplificado para público externo? |
| **Spec de Persona Journey** | Baja | Para implementar issue #21 necesito: personas definidas, user journeys por persona, copy sugerido |

---

## 6. Próximos pasos propuestos

1. **Esperar decisión de PRD-001** (deadline estimado 2026-03-21) → actualizar Hero + docs de instalación
2. **Actualizar Hero CTA** para que apunte a `/docs/getting-started` (se puede hacer ya, independiente de PRD-001)
3. **Coordinar demo/GIF** con producto para tener contenido real para el launch
4. **Crear tests para docs-registry.ts** (deuda técnica de bajo riesgo pero fácil de pagar)

---

*Documento mantenido por el Web Engineer. Actualizar tras cada sprint o cambio de prioridad.*
