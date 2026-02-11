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

const scrapeTableData = () => {
  // 1. 定位到具有 tbl_wrap ID 的容器
  const container = document.querySelector('#tbl_wrap');
  if (!container) return [];

  // 2. 获取表头 (thead 中的列名)
  const headers = Array.from(container.querySelectorAll('thead th, thead td')).map(el => el.textContent?.trim() || '');

  // 3. 获取数据行 (tbody 中的 tr)
  const rows = container.querySelectorAll('tbody tr');

  return Array.from(rows).map(row => {
    // 获取当前行所有的单元格 (th 和 td)
    const cells = Array.from(row.querySelectorAll('th, td'));

    const rowData: Record<string, string> = {};
    cells.forEach((cell, index) => {
      // 这里的 replace(/\s+/g, '') 用于去除数据中的特殊空白字符（如 &nbsp; 或 　）
      const value = cell.textContent?.trim().replace(/\s+/g, '') || '';
      const headerName = headers[index] || `column_${index}`;
      rowData[headerName] = value;
    });

    return rowData;
  });
};

const goToFirstPage = () => {
  const firstPage = Array.from(document.querySelectorAll('.pages a, .pages span')).find(
    el => el.textContent?.trim() === '1',
  );
  if (firstPage && !firstPage.classList.contains('pagecurr')) {
    (firstPage as HTMLElement).click();
    return true;
  }
  return false;
};

const goToNextPage = () => {
  const nextBtn = Array.from(document.querySelectorAll('.pages .pageone')).find(el => el.textContent?.trim() === '下一页');
  if (nextBtn && !nextBtn.classList.contains('pagedisabled')) {
    (nextBtn as HTMLElement).click();
    return true;
  }
  return false;
};

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [isCozePage, setIsCozePage] = useState(false);
  const [isSinaPage, setIsSinaPage] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const url = tabs[0]?.url || '';
      setIsCozePage(url.includes('coze.cn/template'));
      setIsSinaPage(url.includes('vip.stock.finance.sina.com.cn/mkt/#china_us'));
    });
  }, []);

  const downloadCSV = (data: any[], filenamePrefix: string) => {
    if (!data || data.length === 0) {
      alert('没有获取到数据');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScrapeCoze = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    setIsScraping(true);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeCozeTemplates,
      });

      const data = results[0]?.result;
      if (data) {
        downloadCSV(data as any[], 'coze_templates');
      } else {
        alert('未能抓取到数据');
      }
    } catch (error) {
      console.error('Scraping failed:', error);
      alert('获取数据失败，请检查控制台。');
    } finally {
      setIsScraping(false);
    }
  };

  const handleScrapeSina = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    setIsScraping(true);
    setProgress('正在准备抓取...');
    const allData: any[] = [];

    try {
      // 1. 跳转到第一页
      setProgress('正在跳转到第一页...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: goToFirstPage,
      });

      // 等待第一页加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      let hasNextPage = true;
      let pageNum = 1;

      while (hasNextPage) {
        setProgress(`正在抓取第 ${pageNum} 页...`);

        // 2. 抓取当前页数据
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeTableData,
        });

        const pageData = results[0]?.result as any[];
        if (pageData && pageData.length > 0) {
          allData.push(...pageData);
        }

        // 3. 尝试跳转下一页
        const navResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: goToNextPage,
        });

        hasNextPage = navResults[0]?.result as boolean;

        if (hasNextPage) {
          pageNum++;
          setProgress(`跳转到第 ${pageNum} 页，等待加载...`);
          // 4. 等待 2 秒
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setProgress(`抓取完成，共 ${allData.length} 条数据。正在下载...`);
      downloadCSV(allData, 'sina_stocks_all');
    } catch (error) {
      console.error('Pagination scraping failed:', error);
      alert('自动翻页抓取失败，请检查页面状态或控制台。');
    } finally {
      setIsScraping(false);
      setProgress('');
    }
  };

  return (
    <div className={cn('App', 'p-4 min-w-[240px]', isLight ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100')}>
      <div className="flex flex-col gap-4">
        {/* Coze Button - Only show on Coze page */}
        {isCozePage && (
          <div className="flex flex-col gap-2">
            <button
              disabled={isScraping}
              onClick={handleScrapeCoze}
              className={cn(
                'rounded px-4 py-2 font-bold shadow transition-all',
                isLight ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-700',
                isScraping && 'opacity-50 cursor-wait',
              )}>
              获取coze模板数据
            </button>
            <p className="text-[10px] text-green-500 text-center font-medium">检测到 Coze 模板页面</p>
          </div>
        )}

        {/* Sina Button - Only show on Sina page */}
        {isSinaPage && (
          <div className="flex flex-col gap-2">
            <button
              disabled={isScraping}
              onClick={handleScrapeSina}
              className={cn(
                'rounded px-4 py-2 font-bold shadow transition-all',
                isLight ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-orange-600 text-white hover:bg-orange-700',
                isScraping && 'opacity-50 cursor-wait',
              )}>
              {isScraping ? '正在自动翻页抓取...' : '获取中概股数据 (全量)'}
            </button>
            <p className="text-[10px] text-orange-500 text-center font-medium">检测到新浪财经中概股页面</p>
            {progress && <p className="text-xs text-blue-500 text-center mt-2 animate-pulse">{progress}</p>}
          </div>
        )}

        {/* Fallback message when on neither page */}
        {!isCozePage && !isSinaPage && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-sm font-bold text-red-500">未检测到目标页面</p>
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              此工具仅在以下页面生效：
              <br />
              1. coze.cn/template
              <br />
              2. sina.com.cn (中概股)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
