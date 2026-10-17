<?xml version="1.0" encoding="UTF-8"?>
<!-- Display stylesheet only: browsers use it to show sitemap.xml as a readable table.
     Search engines read the raw XML and ignore this file. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap | Nikatsam</title>
        <style>
          body { font-family: system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #0b0d14; color: #eef0fb; line-height: 1.5; }
          h1 { font-size: 1.4rem; margin: 0 0 4px; }
          p.note { color: #9aa3c2; margin: 0 0 20px; font-size: 0.92rem; }
          table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
          th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a3050; vertical-align: top; }
          th { color: #9aa3c2; font-weight: 600; position: sticky; top: 0; background: #0b0d14; }
          a { color: #7c8cff; word-break: break-all; }
          .langs a { display: inline-block; margin: 0 6px 2px 0; font-size: 0.82rem; }
          @media (max-width: 700px) { .hide-small { display: none; } }
        </style>
      </head>
      <body>
        <h1>Sitemap</h1>
        <p class="note">
          <xsl:value-of select="count(sm:urlset/sm:url)"/> URLs. This page is for people; search engines read the same file as XML.
        </p>
        <table>
          <thead>
            <tr><th>Page</th><th class="hide-small">Last updated</th><th>Languages</th></tr>
          </thead>
          <tbody>
            <xsl:for-each select="sm:urlset/sm:url">
              <tr>
                <td><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></td>
                <td class="hide-small"><xsl:value-of select="sm:lastmod"/></td>
                <td class="langs">
                  <xsl:for-each select="xhtml:link[@hreflang != 'x-default']">
                    <a href="{@href}"><xsl:value-of select="@hreflang"/></a>
                  </xsl:for-each>
                </td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
