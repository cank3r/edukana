/** «1 aviso publicado», «3 avisos publicados»: el número con la frase en singular o plural. */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
