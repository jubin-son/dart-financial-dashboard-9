'use client';

import {
  useRef,
  useState,
} from 'react';

import {
  extractFinancialData,
} from '../../lib/pdfFinancialExtractor';

const FIELD_LABELS = {
  revenue: '매출액',
  operatingIncome: '영업이익',
  netIncome: '당기순이익',
  currentAssets: '유동자산',
  totalAssets: '자산총계',
  currentLiabilities: '유동부채',
  totalLiabilities: '부채총계',
  totalEquity: '자본총계',
  operatingCashFlow:
    '영업활동현금흐름',
  investingCashFlow:
    '투자활동현금흐름',
  financingCashFlow:
    '재무활동현금흐름',
};

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return value.toLocaleString(
    'ko-KR'
  );
}

export default function PdfUpload({
  selectedFile,
  onFileSelect,
  onExtractedData,
  onAnalyze,
  disabled = false,
}) {
  const inputRef =
    useRef(null);

  const [status, setStatus] =
    useState('idle');

  const [message, setMessage] =
    useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [preview, setPreview] =
    useState('');

  const [
    extractedData,
    setExtractedData,
  ] = useState(null);

  async function loadPdfJs() {
    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    await new Promise(
      (resolve, reject) => {
        const script =
          document.createElement(
            'script'
          );

        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

        script.onload =
          resolve;

        script.onerror = () =>
          reject(
            new Error(
              'PDF.js를 불러오지 못했습니다.'
            )
          );

        document.head.appendChild(
          script
        );
      }
    );

    return window.pdfjsLib;
  }

  async function extractPdfText(
    file
  ) {
    setStatus('loading');
setProgressStep(1);
setMessage('PDF 내용을 읽고 있습니다...');

    setPreview('');
    setExtractedData(null);

    try {
      const pdfjs =
        await loadPdfJs();

      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const arrayBuffer =
        await file.arrayBuffer();

      const loadingTask =
        pdfjs.getDocument({
          data: new Uint8Array(
            arrayBuffer
          ),
        });

      const pdf =
        await loadingTask.promise;

      const pageTexts = [];

      for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber += 1
      ) {
        const page =
          await pdf.getPage(
            pageNumber
          );

        const textContent =
          await page.getTextContent();

        const pageText =
          textContent.items
            .map(
              (item) =>
                item.str || ''
            )
            .join(' ');

        pageTexts.push(
          `--- PAGE ${pageNumber} ---\n${pageText}`
        );
      }

      const fullText =
        pageTexts.join('\n');

        setProgressStep(2);
setMessage('재무제표 핵심 계정을 추출하고 있습니다...');

      const financialData =
        extractFinancialData(
          fullText
        );
        setProgressStep(3);

      console.log(
        'PDF 재무제표 추출 결과:',
        financialData
      );

      setExtractedData(
        financialData
      );

      onExtractedData?.(
        financialData
      );

      setStatus('success');
setProgressStep(3);

setMessage(
  `분석 준비 완료 · ${pdf.numPages}페이지 · 핵심계정 ${financialData.coverage.toFixed(0)}% 인식`
);

      setPreview(
        fullText.slice(0, 3000)
      );
    } catch (error) {
      console.error(
        'PDF 분석 실패:',
        error
      );
      setProgressStep(0);
      setStatus('error');

      setMessage(
        error?.message ||
          'PDF 내용을 읽지 못했습니다.'
      );
    }
  }

  async function handleFile(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      file.type !==
      'application/pdf'
    ) {
      alert(
        'PDF 파일만 선택할 수 있습니다.'
      );

      event.target.value = '';
      return;
    }

    const maxSize =
      20 * 1024 * 1024;

    if (file.size > maxSize) {
      alert(
        '20MB 이하의 PDF 파일을 선택해 주세요.'
      );

      event.target.value = '';
      return;
    }

    onFileSelect?.(file);

    await extractPdfText(file);
  }

  function formatFileSize(
    bytes
  ) {
    if (!Number.isFinite(bytes)) {
      return '-';
    }

    if (
      bytes <
      1024 * 1024
    ) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(1)} MB`;
  }

  const rows =
    Object.keys(FIELD_LABELS);

  return (
    <section className="pdf-upload-card">
      <div className="pdf-upload-head">
        <div className="eyebrow">
          AUDIT REPORT UPLOAD
        </div>

        <h3>
          감사보고서 PDF 업로드
        </h3>

        <p>
          DART 자동분석이
          지원되지 않는 경우
          감사보고서를 직접
          업로드해 분석할 수
          있습니다.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFile}
        disabled={
          disabled ||
          status === 'loading'
        }
        style={{
          display: 'none',
        }}
      />

      {!selectedFile ? (
        <div className="pdf-dropzone">
          <div className="pdf-icon">
            PDF
          </div>

          <strong>
            감사보고서 PDF를
            선택하세요.
          </strong>

          <span>
            PDF 형식 · 최대 20MB
          </span>

          <button
            type="button"
            onClick={() =>
              inputRef.current?.click()
            }
          >
            PDF 파일 선택
          </button>
        </div>
      ) : (
        <div className="pdf-dropzone">
          <div className="selected-pdf">
            <div className="selected-pdf-icon">
              PDF
            </div>

            <div className="selected-pdf-info">
              <strong>
                {selectedFile.name}
              </strong>

              <span>
                {formatFileSize(
                  selectedFile.size
                )}
              </span>
            </div>

            <button
              type="button"
              className="pdf-change-button"
              onClick={() =>
                inputRef.current?.click()
              }
              disabled={
                status === 'loading'
              }
            >
              다른 파일 선택
            </button>
          </div>
        </div>
      )}

      {status !== 'idle' && (
  <div
    style={{
      marginTop: 14,
      padding: '16px',
      borderRadius: 12,
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
    }}
  >
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {[
        ['PDF 읽기', 1],
        ['재무제표 추출', 2],
        ['분석 준비', 3],
      ].map(([label, step]) => {
        const completed = progressStep >= step;
        const current =
          status === 'loading' &&
          progressStep === step;

        return (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                background: completed
                  ? '#2457d6'
                  : '#e2e8f0',
                color: completed
                  ? '#ffffff'
                  : '#94a3b8',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {completed ? '✓' : step}
            </div>

            <span
              style={{
                color: completed
                  ? '#172033'
                  : '#94a3b8',
                fontWeight: current
                  ? 700
                  : 500,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>

    <div
      style={{
        marginTop: 12,
        fontSize: 12,
        color:
          status === 'error'
            ? '#dc2626'
            : '#64748b',
      }}
    >
      {message}
    </div>
  </div>
)}
      {extractedData && (
        <div
          style={{
            marginTop: 18,
          }}
        >
          <div
            className="eyebrow"
            style={{
              marginBottom: 8,
            }}
          >
            EXTRACTED FINANCIAL DATA
          </div>

          <h3>
            재무제표 추출 결과
          </h3>

          <p
            style={{
              fontSize: 13,
              color: '#64748b',
            }}
          >
            자동 추출 결과입니다.
            실제 분석 전 원문과
            숫자가 일치하는지
            확인하세요.
          </p>

          <div
            style={{
              overflowX: 'auto',
              marginTop: 14,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse:
                  'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign:
                        'left',
                      padding: 10,
                      borderBottom:
                        '1px solid #e2e8f0',
                    }}
                  >
                    항목
                  </th>

                  <th
                    style={{
                      textAlign:
                        'right',
                      padding: 10,
                      borderBottom:
                        '1px solid #e2e8f0',
                    }}
                  >
                    {extractedData
                      .current
                      .year ??
                      '당기'}
                  </th>

                  <th
                    style={{
                      textAlign:
                        'right',
                      padding: 10,
                      borderBottom:
                        '1px solid #e2e8f0',
                    }}
                  >
                    {extractedData
                      .previous
                      .year ??
                      '전기'}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map(
                  (key) => (
                    <tr key={key}>
                      <td
                        style={{
                          padding:
                            10,
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        {
                          FIELD_LABELS[
                            key
                          ]
                        }
                      </td>

                      <td
                        style={{
                          textAlign:
                            'right',
                          padding:
                            10,
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        {formatNumber(
                          extractedData
                            .current[
                            key
                          ]
                        )}
                      </td>

                      <td
                        style={{
                          textAlign:
                            'right',
                          padding:
                            10,
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        {formatNumber(
                          extractedData
                            .previous[
                            key
                          ]
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <button
  type="button"
  onClick={() => onAnalyze?.(extractedData)}
  style={{
    width: '100%',
    marginTop: 18,
    padding: '14px 18px',
    border: 0,
    borderRadius: 12,
    background: '#2457d6',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  이 데이터로 분석하기 →
</button>
        </div>
      )}

      {preview && (
        <details
          style={{
            marginTop: 18,
          }}
        >
          <summary>
            추출 텍스트 미리보기
          </summary>

          <pre
            style={{
              marginTop: 10,
              maxHeight: 250,
              overflow: 'auto',
              whiteSpace:
                'pre-wrap',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {preview}
          </pre>
        </details>
      )}
    </section>
  );
}