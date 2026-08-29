import { Email } from '../types.js';

export interface ExtractedTask {
  task: string;
  type: 'action' | 'meeting' | 'question' | 'deadline';
  urgency: 'high' | 'normal';
  date?: string;
}

export class AIService {
  /**
   * Summarizes an email or an entire thread into actionable bullet points
   */
  public static async summarizeEmail(email: Email): Promise<string> {
    const text = (email.bodyText || email.snippet || email.bodyHtml || '').trim();

    if (text.length < 40) {
      return `Kısa İleti: "${text}"`;
    }

    // Heuristic & NLP summary generator
    const sentences = text.split(/(?<=[.!?\n])\s+/).filter(s => s.trim().length > 8);
    const keyPoints: string[] = [];

    // Detect action items or dates
    const datePattern = /(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|saat|tarihinde|günü|\d{1,2}[:.]\d{2}|\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık))/i;
    const taskPattern = /(yapalım|tamamlandı|gerekli|lütfen|inceler misin|toplantı|kontrol|rapor|görüşme|ek|onay|teslim|gönder|bekliyorum)/i;

    for (const s of sentences) {
      if (keyPoints.length < 4 && (datePattern.test(s) || taskPattern.test(s))) {
        const clean = s.trim().replace(/\s+/g, ' ');
        if (!keyPoints.includes(clean)) keyPoints.push(clean);
      }
    }

    if (keyPoints.length === 0) {
      keyPoints.push((sentences[0] || text).trim());
      if (sentences.length > 1) keyPoints.push(sentences[1].trim());
    }

    return `📌 Özet:\n• ${keyPoints.join('\n• ')}`;
  }

  /**
   * Extracts actionable tasks, meeting times and questions from email
   */
  public static extractTasks(email: Email): ExtractedTask[] {
    let text = (email.bodyText || email.snippet || '').trim();
    if (!text && email.bodyHtml) {
      text = email.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    }
    if (!text) return [];

    const rawClauses = text.split(/(?<=[.!?\n])\s+/).flatMap(s => s.split(/(?<=[,;])\s+/)).filter(s => s.trim().length > 5);
    const tasks: ExtractedTask[] = [];

    const dateRegex = /(\d{1,2}[:.]\d{2}|\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|yarın|bugün)/i;

    for (const clause of rawClauses) {
      const clean = clause.trim();
      const lower = clean.toLowerCase();

      // Question detection
      if (clean.includes('?') || lower.includes('mısınız') || lower.includes('misiniz') || lower.includes('uygun mu') || lower.includes('edebilir misiniz')) {
        tasks.push({
          task: clean,
          type: 'question',
          urgency: 'high'
        });
        continue;
      }

      // Meeting detection
      if (lower.includes('toplantı') || lower.includes('görüşme') || lower.includes('zoom') || lower.includes('meet')) {
        const dateMatch = clean.match(dateRegex);
        tasks.push({
          task: clean,
          type: 'meeting',
          urgency: 'normal',
          date: dateMatch ? dateMatch[0] : undefined
        });
        continue;
      }

      // Action / Deadline detection
      if (lower.includes('lütfen') || lower.includes('tamamla') || lower.includes('teslim') || lower.includes('incele') || lower.includes('onay') || lower.includes('gönder') || lower.includes('bekliyorum')) {
        const dateMatch = clean.match(dateRegex);
        tasks.push({
          task: clean,
          type: dateMatch ? 'deadline' : 'action',
          urgency: lower.includes('acil') || lower.includes('önemli') ? 'high' : 'normal',
          date: dateMatch ? dateMatch[0] : undefined
        });
      }
    }

    return tasks.slice(0, 6);
  }

  /**
   * Generates 3 contextual smart replies for one-click responding
   */
  public static async generateSmartReplies(email: Email): Promise<string[]> {
    const text = (email.bodyText || email.snippet).toLowerCase();
    const sender = email.fromName.split(' ')[0] || 'Merhaba';

    if (text.includes('toplantı') || text.includes('saat') || text.includes('uygun mudur')) {
      return [
        `Harika, ${sender}. Belirttiğin saatte toplantıya katılıyorum.`,
        `Bilgilendirme için teşekkürler, takvimime ekledim.`,
        `O saatte başka bir görüşmem var, alternatif bir saat belirleyebilir miyiz?`
      ];
    }

    if (text.includes('teşekkür') || text.includes('eline sağlık') || text.includes('tebrik')) {
      return [
        `Rica ederim, her zaman!`,
        `Çok teşekkürler, birlikte başardık.`,
        `İyi çalışmalar dilerim!`
      ];
    }

    if (text.includes('rapor') || text.includes('doküman') || text.includes('incele')) {
      return [
        `Dosyayı aldım ${sender}, gün içinde inceleyip dönüş yapacağım.`,
        `Eline sağlık, detayları kontrol edip geri bildirimde bulunacağım.`,
        `Rapor ulaştı, teşekkürler.`
      ];
    }

    return [
      `Bilgilendirme için teşekkür ederim ${sender}.`,
      `Konuyu inceleyip en kısa sürede dönüş yapacağım.`,
      `Tamamdır, anlaşıldı. İyi çalışmalar!`
    ];
  }

  /**
   * Generates full professional email draft from a natural language prompt
   */
  public static async generateDraft(prompt: string, replyContext?: { fromName?: string; subject?: string; text?: string }): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
    const cleanPrompt = prompt.trim();
    const lowerPrompt = cleanPrompt.toLowerCase();
    const recipient = replyContext?.fromName || 'İlgili Kişi';

    let subject = replyContext?.subject ? (replyContext.subject.startsWith('Re:') ? replyContext.subject : `Re: ${replyContext.subject}`) : 'Bilgilendirme';
    let bodyText = '';

    if (lowerPrompt.includes('toplantı') || lowerPrompt.includes('randevu') || lowerPrompt.includes('görüşme')) {
      subject = subject === 'Bilgilendirme' ? 'Toplantı Planlaması ve Teyidi' : subject;
      bodyText = `Merhaba ${recipient},\n\n${cleanPrompt} konusuna istinaden yazıyorum. Belirttiğiniz detayları inceledim, uygun bir zaman diliminde toplantımızı gerçekleştirebiliriz.\n\nToplantı ajandası ve görüşmek istediğiniz ek konular varsa lütfen iletiniz.\n\nİyi çalışmalar dilerim,\nSaygılarımla.`;
    } else if (lowerPrompt.includes('teşekkür') || lowerPrompt.includes('alındı') || lowerPrompt.includes('onay')) {
      subject = subject === 'Bilgilendirme' ? 'Bilgilendirme ve Teşekkür' : subject;
      bodyText = `Merhaba ${recipient},\n\nİletiniz tarafımıza ulaştı, bilgilendirmeniz için çok teşekkür ederim.\n\n${cleanPrompt}\n\nKonu ile ilgili sonraki aşamalarda tekrar iletişimde olacağız. İyi çalışmalar dilerim.`;
    } else if (lowerPrompt.includes('teklif') || lowerPrompt.includes('fiyat') || lowerPrompt.includes('hizmet')) {
      subject = subject === 'Bilgilendirme' ? 'Hizmet Teklifi ve Detaylı Bilgilendirme' : subject;
      bodyText = `Sayın ${recipient},\n\nTalep etmiş olduğunuz hizmet detayları ve fiyatlandırma teklifimiz ekte bilgilerinize sunulmuştur.\n\n${cleanPrompt}\n\nTeklifimizi inceledikten sonra sorularınız veya revizyon talepleriniz olursa memnuniyetle yanıtlayabilirim.\n\nSaygılarımla,\nİyi çalışmalar.`;
    } else if (lowerPrompt.includes('reddet') || lowerPrompt.includes('olumsuz') || lowerPrompt.includes('uygun değil')) {
      subject = subject === 'Bilgilendirme' ? 'Talep Değerlendirmesi' : subject;
      bodyText = `Merhaba ${recipient},\n\nİlettiğiniz teklif ve ilgi için teşekkür ederiz. Mevcut planlama ve önceliklerimiz doğrultusunda şu aşamada talebinize olumlu yanıt veremediğimizi üzülerek belirtmek isteriz.\n\nİlerleyen dönemlerdeki projelerde yeniden bir araya gelmeyi umar, çalışmalarınızda başarılar dileriz.\n\nSaygılarımla.`;
    } else {
      subject = subject === 'Bilgilendirme' ? (cleanPrompt.length > 40 ? cleanPrompt.substring(0, 40) + '...' : cleanPrompt) : subject;
      bodyText = `Merhaba ${recipient},\n\n${cleanPrompt}\n\nKonu hakkında değerlendirmelerinizi rica eder, iyi çalışmalar dilerim.\n\nSaygılarımla.`;
    }

    const bodyHtml = bodyText.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

    return { subject, bodyHtml, bodyText };
  }

  /**
   * Enhances / transforms email draft text (Formal, Friendly, Concise, Persuasive, Expand, Fix Grammar)
   */
  public static async polishText(text: string, style: 'formal' | 'friendly' | 'concise' | 'persuasive' | 'expand' | 'fix_grammar'): Promise<string> {
    if (!text || text.trim().length === 0) return text;

    const clean = text.trim();

    switch (style) {
      case 'formal':
        return `Sayın Yetkili / İlgili,\n\n${clean}\n\nKonuyla ilgili değerlendirmelerinizi rica eder, iyi çalışmalar dilerim.\n\nSaygılarımla,`;
      case 'friendly':
        return `Selamlar,\n\n${clean}\n\nUmarım her şey yolundadır! Herhangi bir sorunuz olursa lütfen çekinmeden iletin.\n\nSevgiler,`;
      case 'concise':
        return `${clean.split('.').slice(0, 2).join('.')}. Detaylar için iletişime geçebilirsiniz.`;
      case 'persuasive':
        return `Merhaba,\n\n${clean}\n\nBu çözümün iş süreçlerimize sağlayacağı katma değeri birlikte değerlendirmekten memnuniyet duyarız. Görüşlerinizi bekliyoruz.\n\nSaygılarımla,`;
      case 'expand':
        return `Merhaba,\n\n${clean}\n\nKonu ile ilgili detaylı analizlerimiz tamamlanmış olup, tüm aşamalar planlandığı şekilde yürütülmektedir. İlave bilgi veya sorularınız için her zaman iletişime geçebilirsiniz.\n\nİyi çalışmalar dilerim,`;
      case 'fix_grammar':
      default:
        return clean.replace(/(^\s*|\.\s*)([a-zçğışöü])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    }
  }

  /**
   * Analyzes an email for potential phishing, spoofing or suspicious links
   */
  public static analyzeSecurity(email: Email): {
    score: number; // 0 to 100 (0: safe, 100: critical threat)
    level: 'safe' | 'low' | 'medium' | 'high';
    reasons: string[];
    hasBlockedImages: boolean;
  } {
    const reasons: string[] = [];
    let score = 0;

    const lowerSubject = email.subject.toLowerCase();
    const lowerBody = (email.bodyText + ' ' + email.bodyHtml).toLowerCase();

    // Suspicious keywords
    if (/şifreniz.*(doldu|sıfırla|acil|hemen)/i.test(lowerSubject) || /şifreniz.*(doldu|sıfırla|acil|hemen)/i.test(lowerBody)) {
      score += 35;
      reasons.push('İleti içerisinde acil şifre sıfırlama veya hesap güvenliği uyarısı tespit edildi.');
    }

    if (/kredi kartı|hesap numarası|iban|ödeme dekontu|fatura borcu/i.test(lowerSubject) && !email.fromEmail.includes('banka')) {
      score += 25;
      reasons.push('Finansal talep veya ödeme uyarısı içeriyor.');
    }

    // External image tracking check
    const hasExternalImages = /<img[^>]+src=["']https?:\/\//i.test(email.bodyHtml);
    if (hasExternalImages) {
      score += 10;
      reasons.push('Gizlilik riski oluşturan harici izleme görselleri içeriyor.');
    }

    // Check sender domain vs display name
    const domain = email.fromEmail.split('@')[1] || '';
    if (email.fromName.toLowerCase().includes('google') && !domain.includes('google.com')) {
      score += 45;
      reasons.push('Gönderici adı "Google" görünüyor ancak alan adı sahte.');
    }

    let level: 'safe' | 'low' | 'medium' | 'high' = 'safe';
    if (score >= 50) level = 'high';
    else if (score >= 30) level = 'medium';
    else if (score > 0) level = 'low';

    return {
      score,
      level,
      reasons,
      hasBlockedImages: hasExternalImages
    };
  }
}
