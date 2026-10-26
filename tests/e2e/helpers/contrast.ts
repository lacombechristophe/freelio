import type { Locator } from "@playwright/test"

export async function contrast(locator: Locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!
    canvas.width = canvas.height = 1
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const blend = (over: number[], under: number[]) => over.slice(0, 3).map((value, i) => value * over[3] / 255 + under[i] * (1 - over[3] / 255))
    const parents: Element[] = []
    for (let node: Element | null = element; node; node = node.parentElement) parents.unshift(node)
    let background = [255, 255, 255]
    for (const node of parents) background = blend(rgba(getComputedStyle(node).backgroundColor), background)
    const foreground = blend(rgba(getComputedStyle(element).color), background)
    const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
    const a = luminance(foreground), b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  })
}
