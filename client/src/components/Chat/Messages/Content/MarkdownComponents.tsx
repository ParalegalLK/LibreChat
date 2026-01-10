import React, { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions, apiBaseUrl } from 'librechat-data-provider';
import MermaidErrorBoundary from '~/components/Messages/Content/MermaidErrorBoundary';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import Mermaid from '~/components/Messages/Content/Mermaid';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useFileDownload } from '~/data-provider';
import { useCodeBlockContext } from '~/Providers';
import { handleDoubleClick } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

// S3 URL pattern for paralegal S3 buckets
const S3_URL_PATTERN = /^https:\/\/paralegal-(prod|decisions)\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//;
const PRESIGNED_URL_API = import.meta.env.VITE_PRESIGNED_URL_API || 'https://www.dev.paralegal.lk';

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isMermaid || isSingleLine)).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
    const content = typeof children === 'string' ? children : String(children);
    return (
      <MermaidErrorBoundary code={content}>
        <Mermaid id={`mermaid-${blockIndex}`}>{content}</Mermaid>
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

export const codeNoExecution: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (lang === 'math') {
    return children;
  } else if (lang === 'mermaid') {
    const content = typeof children === 'string' ? children : String(children);
    return <Mermaid>{content}</Mermaid>;
  } else if (typeof children === 'string' && children.split('\n').length === 1) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }
});

type TAnchorProps = {
  href: string;
  children: React.ReactNode;
};

export const a: React.ElementType = memo(({ href, children }: TAnchorProps) => {
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

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file_id);

  // Handler for S3 URLs - fetches presigned URL and opens in new tab
  const handleS3Click = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();

      if (isLoadingPresigned) {
        return;
      }

      setIsLoadingPresigned(true);

      // Open blank window immediately to avoid popup blockers
      const newWindow = window.open('about:blank', '_blank');

      showToast({
        status: 'info',
        message: 'Generating secure link...',
      });

      try {
        const response = await fetch(`${PRESIGNED_URL_API}/api/pdf/get-pdf-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ link: href }),
        });

        const data = await response.json();

        if (data.success && newWindow) {
          newWindow.location.href = data.presigned_url;
        } else {
          console.error('Error getting presigned URL:', data.error);
          showToast({
            status: 'error',
            message: 'Failed to generate secure link',
          });
          // Fallback to original URL
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
        // Fallback to original URL
        if (newWindow) {
          newWindow.location.href = href;
        }
      } finally {
        setIsLoadingPresigned(false);
      }
    },
    [href, isLoadingPresigned, showToast],
  );

  const props: { target?: string; onClick?: React.MouseEventHandler } = { target: '_new' };

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
      const link = document.createElement('a');
      link.href = stream.data;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(stream.data);
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

type TParagraphProps = {
  children: React.ReactNode;
};

export const p: React.ElementType = memo(({ children }: TParagraphProps) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

type TImageProps = {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export const img: React.ElementType = memo(({ src, alt, title, className, style }: TImageProps) => {
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
