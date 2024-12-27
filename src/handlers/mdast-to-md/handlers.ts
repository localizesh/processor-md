
export const headingMdastToMd = (node: any, state: any, info: any) => {

  const rank = Math.max(Math.min(6, node.depth || 1), 1)

  const tracker = state.createTracker(info)

  if (
    "properties" in node &&
    "marker" in node?.properties &&
    (node.properties?.marker === "=" || node.properties?.marker === "-")
  ) {
    const exit = state.enter('headingSetext')
    const subexit = state.enter('phrasing')
    const value = state.containerPhrasing(node, {
      ...tracker.current(),
      before: '\n',
      after: '\n'
    })
    subexit()
    exit()

    return (
      value +
      '\n' +
      (rank === 1 ? '=' : '-').repeat(value.length - (Math.max(value.lastIndexOf('\r'), value.lastIndexOf('\n')) + 1)
      )
    )
  }

  const sequence = '#'.repeat(rank)
  const exit = state.enter('headingAtx')
  const subexit = state.enter('phrasing')

  tracker.move(sequence + ' ')

  let value = state.containerPhrasing(node, {
    before: '# ',
    after: '\n',
    ...tracker.current()
  })

  if (/^[\t ]/.test(value)) {
    value =
      '&#x' +
      value.charCodeAt(0).toString(16).toUpperCase() +
      ';' +
      value.slice(1)
  }

  value = value ? sequence + ' ' + value : sequence

  if (state.options.closeAtx) {
    value += ' ' + sequence
  }

  subexit()
  exit()

  return value
}

export const breakHandler = (node: any) => {

  const defaultValues: {[key: string]: string} = {
    break: "<br>",
    thematicBreak: "---"
  }

  let marker: string = node?.properties?.marker;
  return marker ? marker : (defaultValues[node.type]) || "";
}
