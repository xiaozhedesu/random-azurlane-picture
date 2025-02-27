import { h, Context, Schema, Logger } from 'koishi'
import { JSDOM } from 'jsdom'

export const name = 'random-azurlane-picture'

export interface Config {
  showInfo: boolean
}

export const Config: Schema<Config> = Schema.object({
  showInfo: Schema.boolean().default(false)
    .description('在发送图片的时候同时发送图片信息')
}).description('发送消息配置');

const logger = new Logger(name);

/**
 * 根据数组长度随机返回一个下标
 * @param length 数组长度
 * @returns 随机下标 [0, length - 1]
 */
const randomIndex = (length: number): number => {
  return Math.floor(Math.random() * length);
}

/**
 * 获取指定网页的document元素
 */
async function getDocument(url: string): Promise<Document> {
  // 获取网页资源
  let htmlText = await fetch(url)
    .then(response => response.text());

  // 转DOM
  return new JSDOM(htmlText).window.document;
}

// 一格漫数据
let mangas = [];

/**
 * 判断数据是否存在于数组
 * @param mangaData 漫画数据
 * @returns boolean
 */
function isMangaDataExist(mangaData): boolean {
  for (const manga of mangas) {
    if (
      mangaData.title === manga.title &&
      mangaData.link === mangaData.link
    ) {
      return true;
    }
    return false;
  }
}

/**
 * 定时任务
 */
namespace Task {
  let DailyTaskId = null;

  /**
   * 漫画资源更新函数
   */
  async function updateMangaData() {
    const mangaListUrl = 'https://wiki.biligame.com/blhx/%E4%B8%80%E6%A0%BC%E6%BC%AB%E7%94%BB'
    const document = await getDocument(mangaListUrl);
    // 定位到漫画大格
    const row = document.getElementsByClassName('row')[1];
    const divs = Array.from(row.getElementsByTagName('div')).reverse() as HTMLElement[];

    mangas = [];
    // 遍历漫画数组，获取关键信息（图片链接和图片名字）
    for (const div of divs) {
      let mangaData = {
        link: null,
        title: null,
      };
      const a = div.getElementsByTagName('a')[0];
      // 获取质量更高图片的链接
      const href = 'https://wiki.biligame.com' + a.getAttribute('href');
      const imgDoc = await getDocument(href);
      // 图片大格
      const file = imgDoc.getElementById('file');
      const img = file.getElementsByTagName('img')[0];
      mangaData.link = img.getAttribute('src');
      mangaData.title = img.getAttribute('alt');

      if (!isMangaDataExist(mangaData)) {
        mangas.push(mangaData)
      }
    }
  }

  /**
   * 定时任务启动函数
   */
  export function start(): void {
    // 单次需要更新的内容
    const task = async () => {
      await updateMangaData();

      logger.info('update complete')
    }
    task();

    // 获取到次日0点的时间差
    const date = new Date();
    const nowTime = date.getTime();
    date.setDate(date.getDate() + 1);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    const doTime = date.getTime();
    const diffTime = doTime - nowTime;

    // 设置定时任务
    setTimeout(() => {
      task();

      DailyTaskId = setInterval(task, 24 * 60 * 60 * 1000);
    }, diffTime);
  }

  /**
   * 定时任务终止函数
   */
  export async function end(): Promise<void> {
    if (DailyTaskId) {
      clearInterval(DailyTaskId);
    }
  }
}

export function apply(ctx: Context, config: Config) {
  // 开启定时任务
  Task.start();

  // 停用定时任务
  ctx.on('dispose', async () => {
    await Task.end();
  })

  ctx.command('random-azurlane-manga').alias('随机航线一格漫')
    .action(({ session }) => {
      const index = randomIndex(mangas.length)
      const mangaData = mangas[index];

      if (config.showInfo) {
        session.send(`当前图片：${mangaData.title}`);
      }
      session.send(h('img', { src: mangaData.link }))
    })
}
