import React, { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions, apiBaseUrl, dataService } from 'librechat-data-provider';
import Mermaid, { MermaidErrorBoundary } from '~/components/Messages/Content/Mermaid';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import { handleDoubleClick, triggerDownload } from '~/utils';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useFileDownload } from '~/data-provider';
import { useCodeBlockContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

// S3 URL pattern for paralegal S3 buckets
const S3_URL_PATTERN = /^https:\/\/paralegal-(prod|decisions)\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//;

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

const isSingleLineCode = (children: React.ReactNode): boolean => {
  if (typeof children === 'string') {
    return !children.includes('\n');
  }
  if (Array.isArray(children)) {
    return children.every((child) => typeof child === 'string' && !child.includes('\n'));
  }
  return false;
};

export const code: React.ElementType = memo(function MarkdownCode({
  className,
  children,
}: TCodeProps) {
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = isSingleLineCode(children);

  const { getNextIndex, getNextMermaidIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isMermaid || isSingleLine)).current;
  /* Mermaid fences do not consume a code-block index, so every one of them in a
   * message would otherwise share `blockIndex` and collapse onto a single
   * artifact id. They carry their own sequence instead. */
  const mermaidIndex = useRef(isMermaid ? getNextMermaidIndex() : -1).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
    const content = typeof children === 'string' ? children : String(children);
    return (
      <MermaidErrorBoundary code={content}>
        <Mermaid id={`mermaid-${mermaidIndex}`}>{content}</Mermaid>
      </MermaidErrorBoundary>
    );
  } else if (isSingleLine) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return (
      <CodeBlock
        lang={lang ?? 'text'}
        codeChildren={children}
        blockIndex={blockIndex}
        allowExecution={canRunCode}
      />
    );
  }
});
code.displayName = 'MarkdownCode';

export const codeNoExecution: React.ElementType = memo(function MarkdownCodeNoExecution({
  className,
  children,
}: TCodeProps) {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (lang === 'math') {
    return children;
  } else if (lang === 'mermaid') {
    const content = typeof children === 'string' ? children : String(children);
    return <Mermaid>{content}</Mermaid>;
  } else if (isSingleLineCode(children)) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }
});
codeNoExecution.displayName = 'MarkdownCodeNoExecution';

type TAnchorProps = {
  href: string;
  children: React.ReactNode;
};

export const a: React.ElementType = memo(function MarkdownAnchor({ href, children }: TAnchorProps) {
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const [isLoadingPresigned, setIsLoadingPresigned] = useState(false);

  // Check if this is an S3 URL that needs presigned URL handling
  const isS3Url = useMemo(() => S3_URL_PATTERN.test(href), [href]);

  const {
    file_id = '',
    filename = '',
    filepath,
  } = useMemo(() => {
    const pattern = new RegExp(`(?:files|outputs)/${user?.id}/([^\\s]+)`);
    const match = href.match(pattern);
    if (match && match[0]) {
      const path = match[0];
      const parts = path.split('/');
      const name = parts.pop();
      const file_id = parts.pop();
      return { file_id, filename: name, filepath: path };
    }
    return { file_id: '', filename: '', filepath: '' };
  }, [user?.id, href]);

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file_id, { direct: false });

  // Handler for S3 URLs - fetches presigned URL and opens in new tab
  const handleS3Click = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();

      if (isLoadingPresigned) {
        return;
      }

      setIsLoadingPresigned(true);

      const newWindow = window.open('about:blank', '_blank');

      showToast({
        status: 'info',
        message: 'Generating secure link...',
      });

      try {
        const data = await dataService.openPdf(href);

        if (data.success && newWindow) {
          newWindow.location.href = data.presigned_url;
        } else {
          console.error('Error getting presigned URL:', data);
          showToast({
            status: 'error',
            message: 'Failed to generate secure link',
          });
          if (newWindow) {
            newWindow.location.href = href;
          }
        }
      } catch (error) {
        console.error('Error fetching presigned URL:', error);
        showToast({
          status: 'error',
          message: 'Failed to generate secure link',
        });
        if (newWindow) {
          newWindow.location.href = href;
        }
      } finally {
        setIsLoadingPresigned(false);
      }
    },
    [href, isLoadingPresigned, showToast],
  );


  const props: { target?: string; onClick?: React.MouseEventHandler } = { target: '_blank' };

  // Handle S3 URLs with presigned URL fetching
  if (isS3Url) {
    return (
      <a
        href={href}
        onClick={handleS3Click}
        target="_blank"
        rel="noopener noreferrer"
        style={{ cursor: isLoadingPresigned ? 'wait' : 'pointer' }}
      >
        {children}
      </a>
    );
  }

  // Handle regular links (non-file, non-S3)
  if (!file_id || !filename) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  // Handle file download links
  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const stream = await downloadFile();
      if (stream.data == null || stream.data === '') {
        console.error('Error downloading file: No data found');
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
        return;
      }
      triggerDownload(stream.data, filename);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  props.onClick = handleDownload;
  props.target = '_blank';

  const domainServerBaseUrl = `${apiBaseUrl()}/api`;

  return (
    <a
      href={
        filepath?.startsWith('files/')
          ? `${domainServerBaseUrl}/${filepath}`
          : `${domainServerBaseUrl}/files/${filepath}`
      }
      {...props}
    >
      {children}
    </a>
  );
});
a.displayName = 'MarkdownAnchor';

type TParagraphProps = {
  children: React.ReactNode;
};

export const p: React.ElementType = memo(function MarkdownParagraph({ children }: TParagraphProps) {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});
p.displayName = 'MarkdownParagraph';

type TTableProps = {
  children: React.ReactNode;
};

export const table: React.ElementType = memo(function MarkdownTable({ children }: TTableProps) {
  return (
    <div className="markdown-table-wrapper w-full max-w-full">
      <table>{children}</table>
    </div>
  );
});
table.displayName = 'MarkdownTable';

type TImageProps = {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export const img: React.ElementType = memo(function MarkdownImage({
  src,
  alt,
  title,
  className,
  style,
}: TImageProps) {
  // Get the base URL from the API endpoints
  const baseURL = apiBaseUrl();

  // If src starts with /images/, prepend the base URL
  const fixedSrc = useMemo(() => {
    if (!src) return src;

    // If it's already an absolute URL or doesn't start with /images/, return as is
    if (src.startsWith('http') || src.startsWith('data:') || !src.startsWith('/images/')) {
      return src;
    }

    // Prepend base URL to the image path
    return `${baseURL}${src}`;
  }, [src, baseURL]);

  return <img src={fixedSrc} alt={alt} title={title} className={className} style={style} />;
});
img.displayName = 'MarkdownImage';
