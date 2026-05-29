export const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("es-GT").format(n);
