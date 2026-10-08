import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'
import { isValidElement, memo, useMemo, type ReactNode } from 'react'
import type { Components, UrlTransform } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeMessageLinks } from './message-text'

interface MessageMarkdownProps {
  content: string
  copiedLabel: string
  copyLabel: string
}

const markdownUrlTransform: UrlTransform = (url) => {
  const value = url.trim()

  if (!value) {
    return ''
  }

  if (value.startsWith('/') || value.startsWith('#')) {
    return value
  }

  try {
    const parsed = new URL(value)

    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    ) {
      return value
    }
  } catch {
    return ''
  }

  return ''
}

function isExternalHttpUrl(href: string | undefined) {
  if (!href) {
    return false
  }

  try {
    const parsed = new URL(href)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The text of a fenced block, for the clipboard.
 *
 * react-markdown hands `pre` its rendered `code` child rather than the source,
 * so the string has to be gathered back out of the element tree.
 */
function readCodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(readCodeText).join('')
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return readCodeText(node.props.children)
  }

  return ''
}

const markdownComponents: Components = {
  a: ({ className, href, node: _node, ...props }) => {
    const safeHref = href || undefined
    const external = isExternalHttpUrl(safeHref)

    if (!safeHref) {
      return <span>{props.children}</span>
    }

    return (
      <a
        className={cn('text-primary underline underline-offset-2', className)}
        href={safeHref}
        rel={external ? 'noreferrer noopener' : undefined}
        target={external ? '_blank' : undefined}
        {...props}
      />
    )
  },
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      className={cn(
        'border-border text-muted-foreground my-3 border-l-2 pl-3 text-sm leading-6',
        className,
      )}
      {...props}
    />
  ),
  code: ({ children, className, node: _node, ...props }) => (
    <code
      className={cn(
        'bg-muted rounded border px-1 py-0.5 font-mono text-[0.85em] wrap-break-word',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  ),
  h1: ({ className, node: _node, ...props }) => (
    <h3
      className={cn(
        'mt-4 mb-2 text-base leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h3
      className={cn(
        'mt-4 mb-2 text-base leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn(
        'mt-3 mb-2 text-sm leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, node: _node, ...props }) => (
    <h4
      className={cn(
        'mt-3 mb-1 text-sm leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, node: _node, ...props }) => (
    <h5
      className={cn(
        'mt-3 mb-1 text-sm leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, node: _node, ...props }) => (
    <h6
      className={cn(
        'text-muted-foreground mt-3 mb-1 text-sm leading-6 font-semibold first:mt-0',
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, node: _node, ...props }) => (
    <hr className={cn('border-border my-4', className)} {...props} />
  ),
  input: ({ checked, className, node: _node, type, ...props }) => (
    <input
      checked={type === 'checkbox' ? Boolean(checked) : checked}
      className={cn(
        type === 'checkbox'
          ? 'accent-primary mr-2 h-3.5 w-3.5 align-middle'
          : undefined,
        className,
      )}
      disabled
      readOnly
      type={type}
      {...props}
    />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li className={cn('pl-1', className)} {...props} />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol
      className={cn(
        'my-2 list-decimal space-y-1 pl-5 text-sm leading-6',
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p
      className={cn('my-2 text-sm leading-6 first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table
        className={cn(
          'min-w-max border-collapse text-left text-sm leading-6',
          className,
        )}
        {...props}
      />
    </div>
  ),
  td: ({ className, node: _node, ...props }) => (
    <td
      className={cn('border-border border px-2 py-1 align-top', className)}
      {...props}
    />
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      className={cn(
        'bg-muted border-border border px-2 py-1 align-top font-semibold',
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul
      className={cn(
        'my-2 list-disc space-y-1 pl-5 text-sm leading-6',
        className,
      )}
      {...props}
    />
  ),
}

/** The base map plus a `pre` that carries a copy button for its block. */
function buildMarkdownComponents(
  copyLabel: string,
  copiedLabel: string,
): Components {
  return {
    ...markdownComponents,
    pre: ({ children, className, node: _node, ...props }) => {
      const code = readCodeText(children)

      return (
        <div className="group/code relative my-3">
          {code.trim() ? (
            <CopyButton
              className="bg-card/80 absolute top-2 right-2 opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100"
              copiedLabel={copiedLabel}
              copyLabel={copyLabel}
              value={code}
            />
          ) : null}
          <pre
            className={cn(
              'bg-muted/70 overflow-x-auto rounded-lg border p-3 text-xs leading-5',
              '[&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit',
              '[&_code]:whitespace-pre',
              className,
            )}
            {...props}
          >
            {children}
          </pre>
        </div>
      )
    },
  }
}

const remarkPlugins = [remarkGfm]

/**
 * Memoised because parsing is not free and the content of a message that has
 * already been answered never changes; only its surroundings re-render.
 */
export const MessageMarkdown = memo(function MessageMarkdown({
  content,
  copiedLabel,
  copyLabel,
}: Readonly<MessageMarkdownProps>) {
  // A fresh object each render would give react-markdown a new component map
  // every time and undo the memo above it.
  const components = useMemo(
    () => buildMarkdownComponents(copyLabel, copiedLabel),
    [copiedLabel, copyLabel],
  )

  return (
    <div className="min-w-0 wrap-break-word">
      <Markdown
        disallowedElements={['img']}
        remarkPlugins={remarkPlugins}
        skipHtml
        urlTransform={markdownUrlTransform}
        components={components}
      >
        {normalizeMessageLinks(content)}
      </Markdown>
    </div>
  )
})
