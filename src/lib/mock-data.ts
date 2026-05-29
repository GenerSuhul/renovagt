import type { Brand, Category, Product, Store } from "./types";

export const categories: Category[] = [
  { id: "c1", slug: "herramientas", name: "Herramientas", icon: "Wrench" },
  { id: "c2", slug: "pintura", name: "Pintura", icon: "PaintBucket" },
  { id: "c3", slug: "construccion", name: "Construcción", icon: "HardHat" },
  { id: "c4", slug: "electricidad", name: "Electricidad", icon: "Zap" },
  { id: "c5", slug: "plomeria", name: "Plomería", icon: "Droplet" },
  { id: "c6", slug: "iluminacion", name: "Iluminación", icon: "Lightbulb" },
  { id: "c7", slug: "jardin", name: "Jardín y Exterior", icon: "Trees" },
  { id: "c8", slug: "hogar", name: "Hogar y Decoración", icon: "Sofa" },
  { id: "c9", slug: "electrodomesticos", name: "Electrodomésticos", icon: "Refrigerator" },
];

export const brands: Brand[] = [
  { id: "b1", name: "DeWalt" },
  { id: "b2", name: "Bosch" },
  { id: "b3", name: "Makita" },
  { id: "b4", name: "Stanley" },
  { id: "b5", name: "Sherwin-Williams" },
  { id: "b6", name: "Truper" },
  { id: "b7", name: "Black+Decker" },
  { id: "b8", name: "Philips" },
];

export const stores: Store[] = [
  { id: "s1", name: "RENOVA Zona 10", city: "Guatemala", address: "12 Calle 4-50, Zona 10", phone: "+502 2222 1010", hours: "L-D 8:00-20:00" },
  { id: "s2", name: "RENOVA Mixco", city: "Mixco", address: "Calzada Roosevelt km 13.5", phone: "+502 2222 2020", hours: "L-D 8:00-20:00" },
  { id: "s3", name: "RENOVA Xela", city: "Quetzaltenango", address: "4a Calle 12-15, Zona 3", phone: "+502 7777 3030", hours: "L-S 8:00-19:00" },
  { id: "s4", name: "RENOVA Antigua", city: "Antigua Guatemala", address: "Calle Real 23", phone: "+502 7888 4040", hours: "L-D 9:00-19:00" },
];

const img = (q: string, seed: number) =>
  `https://images.unsplash.com/${q}?auto=format&fit=crop&w=900&q=80&sig=${seed}`;

export const products: Product[] = [
  {
    id: "p1", sku: "TLD-2001", slug: "taladro-dewalt-20v-max",
    name: "Taladro Inalámbrico DeWalt 20V Max",
    brand: "DeWalt", categorySlug: "herramientas",
    price: 1899, originalPrice: 2299, rating: 4.8, reviews: 312,
    image: img("photo-1581244277943-fe4a9c777189", 1),
    description: "Taladro percutor inalámbrico de 20V con batería de litio y maletín de transporte. Ideal para uso profesional en madera, metal y mampostería.",
    specs: [
      { label: "Voltaje", value: "20V Max" },
      { label: "Velocidad", value: "0-1750 rpm" },
      { label: "Mandril", value: "13 mm" },
      { label: "Peso", value: "1.6 kg" },
    ],
    stock: 24, labels: ["bestseller"],
  },
  {
    id: "p2", sku: "PNT-3210", slug: "pintura-latex-sherwin-galon",
    name: "Pintura Látex Premium Blanco - Galón",
    brand: "Sherwin-Williams", categorySlug: "pintura",
    price: 289, rating: 4.7, reviews: 187,
    image: img("photo-1562259949-e8e7689d7828", 2),
    description: "Pintura látex lavable de alta cobertura, acabado mate. Bajo olor y secado rápido.",
    specs: [
      { label: "Rendimiento", value: "40 m²/galón" },
      { label: "Acabado", value: "Mate" },
      { label: "Base", value: "Agua" },
    ],
    stock: 120, labels: ["bestseller"],
  },
  {
    id: "p3", sku: "SRR-1100", slug: "sierra-circular-bosch",
    name: "Sierra Circular Bosch 7-1/4\" 1400W",
    brand: "Bosch", categorySlug: "herramientas",
    price: 1499, originalPrice: 1799, rating: 4.6, reviews: 94,
    image: img("photo-1530124566582-a618bc2615dc", 3),
    description: "Sierra circular profesional con motor de 1400W, hoja de 184mm y guía láser.",
    stock: 8, labels: ["sale", "low-stock"],
  },
  {
    id: "p4", sku: "LED-4400", slug: "foco-led-philips-9w",
    name: "Foco LED Philips 9W Luz Cálida (pack 4)",
    brand: "Philips", categorySlug: "iluminacion",
    price: 159, rating: 4.9, reviews: 540,
    image: img("photo-1565636192335-c44c1ca38a48", 4),
    description: "Pack de 4 focos LED con luz cálida 3000K, equivalente a 60W incandescente.",
    stock: 350, labels: ["bestseller"],
  },
  {
    id: "p5", sku: "MRT-7700", slug: "martillo-stanley-fatmax",
    name: "Martillo Stanley FatMax 16oz",
    brand: "Stanley", categorySlug: "herramientas",
    price: 189, rating: 4.7, reviews: 220,
    image: img("photo-1581147036324-c1c89c2c8b5c", 5),
    description: "Martillo de uña con mango antivibración y cabeza forjada de alta resistencia.",
    stock: 60,
  },
  {
    id: "p6", sku: "CMT-8800", slug: "cemento-saco-42kg",
    name: "Cemento Gris Saco 42.5 kg",
    brand: "Truper", categorySlug: "construccion",
    price: 95, rating: 4.5, reviews: 78,
    image: img("photo-1503387762-592deb58ef4e", 6),
    description: "Cemento de uso general tipo Portland para concreto, repellos y mampostería.",
    stock: 540, labels: ["bestseller"],
  },
  {
    id: "p7", sku: "REF-9900", slug: "refrigerador-bd-300l",
    name: "Refrigeradora Black+Decker 300L Inverter",
    brand: "Black+Decker", categorySlug: "electrodomesticos",
    price: 5499, originalPrice: 6299, rating: 4.6, reviews: 132,
    image: img("photo-1574269910231-bc508bcb40b4", 7),
    description: "Refrigeradora de 2 puertas con tecnología inverter, no frost y eficiencia A+.",
    stock: 14, labels: ["sale", "new"],
  },
  {
    id: "p8", sku: "JRD-1212", slug: "podadora-makita-electrica",
    name: "Podadora de Césped Makita Eléctrica 1800W",
    brand: "Makita", categorySlug: "jardin",
    price: 2899, rating: 4.5, reviews: 41,
    image: img("photo-1416879595882-3373a0480b5b", 8),
    description: "Podadora con ancho de corte 38cm, recolector 40L y altura ajustable.",
    stock: 6, labels: ["new", "low-stock"],
  },
  {
    id: "p9", sku: "ELC-5050", slug: "cable-thhn-12-100m",
    name: "Cable THHN #12 - Rollo 100m",
    brand: "Truper", categorySlug: "electricidad",
    price: 749, rating: 4.6, reviews: 64,
    image: img("photo-1581094288338-2314dddb7ece", 9),
    description: "Cable eléctrico THHN calibre 12 AWG, color blanco, rollo de 100 metros.",
    stock: 80,
  },
  {
    id: "p10", sku: "PLM-6060", slug: "tubo-pvc-1-2",
    name: "Tubo PVC 1/2\" x 6m (pack 10)",
    brand: "Truper", categorySlug: "plomeria",
    price: 219, rating: 4.4, reviews: 22,
    image: img("photo-1581094794329-c8112a89af12", 10),
    description: "Tubería PVC hidráulica, alta presión, 6 metros de largo.",
    stock: 200,
  },
  {
    id: "p11", sku: "DEC-7070", slug: "sofa-3p-gris",
    name: "Sofá Modular 3 Plazas Gris",
    brand: "Truper", categorySlug: "hogar",
    price: 4299, originalPrice: 4999, rating: 4.4, reviews: 18,
    image: img("photo-1555041469-a586c61ea9bc", 11),
    description: "Sofá modular tapizado en tela gris, estructura de madera maciza.",
    stock: 5, labels: ["sale"],
  },
  {
    id: "p12", sku: "BOS-3030", slug: "lijadora-bosch",
    name: "Lijadora Orbital Bosch 300W",
    brand: "Bosch", categorySlug: "herramientas",
    price: 899, rating: 4.6, reviews: 56,
    image: img("photo-1504917595217-d4dc5ebe6122", 12),
    description: "Lijadora orbital con sistema de extracción de polvo y plato de 125mm.",
    stock: 18, labels: ["new"],
  },
];

export const getProductBySlug = (slug: string) =>
  products.find((p) => p.slug === slug);

export const getCategoryBySlug = (slug: string) =>
  categories.find((c) => c.slug === slug);

export const getProductsByCategory = (slug: string) =>
  products.filter((p) => p.categorySlug === slug);

export const getRelatedProducts = (p: Product) =>
  products.filter((x) => x.categorySlug === p.categorySlug && x.id !== p.id).slice(0, 4);
