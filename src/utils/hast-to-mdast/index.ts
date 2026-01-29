// @ts-ignore
import structuredClone from '@ungap/structured-clone'
import { visit } from 'unist-util-visit'
import { createState } from './state.js'

const emptyOptions = {}

export function toMdast(tree: any, options: any) {
  // We have to clone, cause we’ll use `rehype-minify-whitespace` on the tree,
  // which modifies.
  const cleanTree = structuredClone(tree)
  const settings = options || emptyOptions
  
  const state = createState(settings)
  let mdast: any

  visit(cleanTree, function (node: any) {
    if (node && node.type === 'element' && node.properties) {
      const id = String(node.properties.id || '') || undefined

      if (id && !state.elementById.has(id)) {
        state.elementById.set(id, node)
      }
    }
  })

  // @ts-ignore
  const result = state.one(cleanTree, undefined)

  if (!result) {
    mdast = {type: 'root', children: []}
  } else if (Array.isArray(result)) {
    // Assume content.
    const children = result
    mdast = {type: 'root', children}
  } else {
    mdast = result
  }

  // Collapse text nodes, and fix whitespace.
  visit(mdast, function (node: any, index: any, parent: any) {
    if (node.type === 'text' && index !== undefined && parent) {
      const previous = parent.children[index - 1]

      if (previous && previous.type === node.type) {
        previous.value += node.value
        parent.children.splice(index, 1)

        if (previous.position && node.position) {
          previous.position.end = node.position.end
        }

        // Iterate over the previous node again, to handle its total value.
        return index - 1
      }

      // VH: Disabled regex replacement that trims whitespace around newlines
      // node.value = node.value.replace(/[	 ]*(\r?\n|\r)[	 ]*/, '$1')

      // We don’t care about other phrasing nodes in between (e.g., `[ asd ]()`),
      // as there the whitespace matters.
      if (
        parent &&
        (
          parent.type === 'heading' ||
          parent.type === 'paragraph' ||
          parent.type === 'root'
        )
      ) {
        if (!index) {
          node.value = node.value.replace(/^[	 ]+/, '')
        }

        if (index === parent.children.length - 1) {
          node.value = node.value.replace(/[	 ]+$/, '')
        }
      }

      if (!node.value) {
        parent.children.splice(index, 1)
        return index
      }
    }
  })

  return mdast
}