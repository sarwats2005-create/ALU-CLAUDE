import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { landingCopy } from './copy';
import { Extrusion } from './Extrusion';
import { LangSwitch } from './LangSwitch';

export type LandingData = {
  name: string;
  logo: string | null;
  address: string;
  phones: string[];
  footerNote: string;
  rate: number | null;
  types: string[];
};

/** Iraqi local numbers (07xx…) become international (9647xx…) for WhatsApp links. */
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '964' + d.slice(1);
  return d;
}

/** Small cut-face mark used as the list bullet: the same slotted profile as the hero, flat. */
function ProfileMark() {
  return (
    <svg className="lp-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M0 0h6.4v1.6H9.6V0H16v6.4h-1.6v3.2H16V16H9.6v-1.6H6.4V16H0V9.6h1.6V6.4H0ZM8 6.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6Z"
      />
    </svg>
  );
}

export function Landing({ lang, data }: { lang: Lang; data: LandingData }) {
  const c = landingCopy(lang);
  const mapUrl = data.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.name}, ${data.address}`)}`
    : null;
  const firstPhone = data.phones[0];
  const year = new Date().getFullYear();

  return (
    <div className="lp" lang={lang === 'ku' ? 'ckb' : 'en'}>
      <a className="lp-skip" href="#lp-main">
        {lang === 'ku' ? 'بازدان بۆ ناوەڕۆک' : 'Skip to content'}
      </a>
      <header className="lp-head lp-wrap">
        <Link href="/" className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.logo || '/app-icon.png'} alt="" width={36} height={36} />
          <span dir="auto">{data.name}</span>
        </Link>
        <div className="lp-head-actions">
          <LangSwitch lang={lang} />
          <Link href="/login" className="lp-btn lp-btn-quiet" aria-label={c.signIn}>
            <span className="lp-long">{c.signIn}</span>
            <span className="lp-short">{c.signInShort}</span>
          </Link>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-inner">
            <div className="lp-hero-text">
              <h1>{c.headline}</h1>
              <p className="lp-lead">{c.lead}</p>
              {firstPhone || mapUrl ? (
                <div className="lp-ctas">
                  {firstPhone ? (
                    <a className="lp-btn lp-btn-solid" href={`tel:${firstPhone.replace(/[^\d+]/g, '')}`}>
                      {c.call}
                    </a>
                  ) : null}
                  {mapUrl ? (
                    <a className="lp-btn lp-btn-line" href={mapUrl} target="_blank" rel="noopener noreferrer">
                      {c.directions}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="lp-hero-art">
            <Extrusion label={c.extrusionLabel} />
          </div>
        </section>

        <section className="lp-sell lp-wrap" aria-labelledby="lp-sell-title">
          <h2 id="lp-sell-title">{c.sellTitle}</h2>
          <div className="lp-sell-grid">
            <div>
              <h3>{c.rawTitle}</h3>
              <p>{c.rawText}</p>
            </div>
            <div>
              <h3>{c.finishedTitle}</h3>
              <p>{c.finishedText}</p>
            </div>
          </div>
          {data.types.length ? (
            <div className="lp-types">
              <h3>{c.typesTitle}</h3>
              <ul>
                {data.types.map((tname) => (
                  <li key={tname} dir="auto">
                    <ProfileMark />
                    {tname}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="lp-steps" aria-labelledby="lp-steps-title">
          <div className="lp-wrap">
            <h2 id="lp-steps-title">{c.stepsTitle}</h2>
            <ol>
              {c.steps.map(([title, text], i) => (
                <li key={title}>
                  <span className="lp-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {data.address || data.phones.length || data.rate ? (
          <section className="lp-visit" aria-labelledby="lp-visit-title">
            <div className="lp-wrap">
              <h2 id="lp-visit-title">{c.visitTitle}</h2>
              <dl className="lp-visit-grid">
                {data.address ? (
                  <div>
                    <dt>{c.address}</dt>
                    <dd>
                      <span className="lp-address" dir="auto">
                        {data.address}
                      </span>
                      {mapUrl ? (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                          {c.openMap}
                        </a>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {data.phones.length ? (
                  <div>
                    <dt>{c.phone}</dt>
                    <dd>
                      <ul className="lp-phones">
                        {data.phones.map((p) => (
                          <li key={p}>
                            <a href={`tel:${p.replace(/[^\d+]/g, '')}`} dir="ltr">
                              {p}
                            </a>
                            <a className="lp-wa" href={`https://wa.me/${waNumber(p)}`} target="_blank" rel="noopener noreferrer">
                              {c.whatsapp}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                {data.rate ? (
                  <div>
                    <dt>{c.rateTitle}</dt>
                    <dd>
                      <span className="lp-rate" dir="ltr">
                        1 USD = {data.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} IQD
                      </span>
                      <span className="lp-rate-note">{c.rateNote}</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="lp-foot lp-wrap">
        <p>
          <span dir="auto">
            © {year} {data.name}.
          </span>{' '}
          {c.rights}
          {data.footerNote ? (
            <>
              <br />
              <span dir="auto">{data.footerNote}</span>
            </>
          ) : null}
        </p>
        <Link href="/login">{c.signIn}</Link>
      </footer>
    </div>
  );
}
