import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { useEffect, useState } from 'react';

const scrapeCozeTemplates = () => {
  // Select all template cards (article elements with flex and grow classes)
  const templateCards = document.querySelectorAll('article.flex');

  return Array.from(templateCards).map(card => {
    // 1. Background image - find the first img inside the card
    const imgElement = card.querySelector('.semi-image-img') as HTMLImageElement;
    const bgImg = imgElement ? imgElement.src : '';

    // 2. App type - text content of the tag element
    const appTypeElement = card.querySelector('.semi-tag');
    const appType = appTypeElement ? appTypeElement.textContent?.trim() : '';

    // 3. Title - the first prominent text element
    const titleElement = card.querySelector('.overflow-hidden span');
    const title = titleElement ? titleElement.textContent?.trim() : '';

    // 4. Author - text near the avatar
    const authorElement = card.querySelector('.semi-space:nth-child(2) span:first-child');
    const author = authorElement ? authorElement.textContent?.trim() : '';

    // 5. Description - the multi-line text section
    const descElement = card.querySelector('.semi-typography-ellipsis-multiple-line');
    const desc = descElement ? descElement.textContent?.trim() : '';

    // 6. Price - text in the bottom left
    const priceElement = card.querySelector('.font-medium');
    const price = priceElement ? priceElement.textContent?.trim() : '';

    // 7. Copy count - number in the stats section
    const copyCountWrapper = card.querySelector('.flex.items-center.gap-\\[4px\\]');
    const copyCountElement = copyCountWrapper ? copyCountWrapper.querySelector('span:first-child') : null;
    const copyCount = copyCountElement ? copyCountElement.textContent?.trim() : '';

    return {
      bgImg,
      appType,
      title,
      author,
      desc,
      price,
      copyCount,
    };
  });
};

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [isCozePage, setIsCozePage] = useState(false);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const url = tabs[0]?.url;
      if (url && url.includes('coze.cn/template')) {
        setIsCozePage(true);
      } else {
        setIsCozePage(false);
      }
    });
  }, []);

  const downloadCSV = (data: any[]) => {
    if (!data || data.length === 0) {
      alert('没有获取到数据');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${(row[header] || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `coze_templates_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScrape = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeCozeTemplates,
      });

      const data = results[0]?.result;
      if (data) {
        downloadCSV(data as any[]);
      } else {
        alert('未能抓取到数据');
      }
    } catch (error) {
      console.error('Scraping failed:', error);
      alert('获取数据失败，请检查控制台。');
    }
  };

  return (
    <div className={cn('App', 'p-4 min-w-[200px]', isLight ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100')}>
      <div className="flex flex-col gap-4">
        <button
          disabled={!isCozePage}
          onClick={handleScrape}
          className={cn(
            'rounded px-4 py-2 font-bold shadow transition-all',
            isCozePage
              ? isLight
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-400 text-gray-200 cursor-not-allowed',
          )}>
          获取coze模板数据
        </button>
        {!isCozePage && <p className="text-xs text-red-500">请在 coze.cn/template 页面使用此功能</p>}
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
