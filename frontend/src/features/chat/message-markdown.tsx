import { cn } from '@/lib/utils'
import type { Components, UrlTransform } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MessageMarkdownProps {
  content: string
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

const markdownComponents: Components = {
  a: ({ className, href, node: _node, ...props }) => {
    const safeHref = href || undefined
    const external = isExternalHttpUrl(safeHref)

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
        'bg-muted rounded border px-1 py-0.5 font-mono text-[0.85em] break-words',
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
  pre: ({ className, node: _node, ...props }) => (
    <pre
      className={cn(
        'bg-muted/70 my-3 overflow-x-auto rounded-lg border p-3 text-xs leading-5',
        '[&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit',
        '[&_code]:whitespace-pre',
        className,
      )}
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

export function MessageMarkdown({ content }: Readonly<MessageMarkdownProps>) {
  return (
    <div className="min-w-0 break-words">
      <Markdown
        disallowedElements={['img']}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={markdownUrlTransform}
        components={markdownComponents}
      >
        {content}
      </Markdown>
    </div>
  )
}
