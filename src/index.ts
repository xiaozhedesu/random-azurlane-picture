import { h, Context, Schema, Logger } from 'koishi'
import { JSDOM } from 'jsdom'

export const name = 'random-azurlane-picture'
export const inject = ['database']

export interface Config {
  showInfo: boolean
}

export const Config: Schema<Config> = Schema.object({
  showInfo: Schema.boolean().default(false)
    .description('在发送图片的时候同时发送图片信息')
}).description('发送消息配置');

declare module 'koishi' {
  interface Tables {
    mangaDatas: MangaData
  }
}

export interface MangaData {
  id: number,
  link: string,
  title: string,
  base64: string
}

const logger = new Logger(name);

/**
 * 根据数组长度随机返回一个下标
 * @param {number} length 数组长度
 * @returns {number} 随机下标 [0, length - 1]
 */
const randomIndex = (length: number): number => {
  return Math.floor(Math.random() * length);
}

/**
 * 获取指定网页的document元素
 * @param {string} url 网页链接
 * @return {Promise<Document>}
 */
async function getDocument(url: string): Promise<Document> {
  // 获取网页资源
  let htmlText = await fetch(url)
    .then(response => response.text());

  // 转DOM
  return new JSDOM(htmlText).window.document;
}

/**
 * 通过图片链接获取对应文件的 Base64
 * @param {string} imgUrl 图片链接
 * @returns {Promise<string>} Base64 
 */
async function getBase64FromUrl(imgUrl: string): Promise<string> {
  try {
    const response = await fetch(imgUrl);
    if (!response.ok) {
      throw new Error(`请求失败，状态码: ${response.status}`);
    }

    // 将响应体转换为 ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    // 将 ArrayBuffer 转换为 Base64
    const base64String = Buffer.from(arrayBuffer).toString('base64');

    return base64String;
  } catch (error) {
    logger.error('获取 Base64 时出错:', error);
  }
}

/**
 * 定时任务
 */
namespace Task {
  let DailyTaskId = null;

  /**
   * 漫画资源更新函数
   * @param ctx 传入ctx用来使用koishi的数据库服务
   * @return {Promise<void>} 
   */
  async function updateMangaData(ctx): Promise<void> {
    // 碧蓝航线Bwiki一格漫的链接
    const mangaListUrl = 'https://wiki.biligame.com/blhx/%E4%B8%80%E6%A0%BC%E6%BC%AB%E7%94%BB'
    const document = await getDocument(mangaListUrl);
    // 定位到漫画大格
    const row = document.getElementsByClassName('row')[1];
    const divs = Array.from(row.getElementsByTagName('div')).reverse() as HTMLElement[];

    // 遍历漫画数组，获取关键信息（图片链接和图片名字）
    for (const div of divs) {
      let mangaData: MangaData = {
        id: null,
        link: null,
        title: null,
        base64: null,
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

      // 根据title获取id
      mangaData.id = Number(mangaData.title.match(/\d+/)[0]);

      // 获取base64数据
      mangaData.base64 = 'data:image/png;base64,' + await getBase64FromUrl(mangaData.link);
      ctx.database.upsert('mangaDatas', (row) => [mangaData]);
    }
  }

  /**
   * 定时任务启动函数
   * @param ctx 传入ctx用来使用koishi的数据库服务
   * @return {void} 
   */
  export function start(ctx): void {
    // 单次需要更新的内容
    const task = async () => {
      await updateMangaData(ctx);

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
   * @return {Promise<void>}
   */
  export async function end(): Promise<void> {
    if (DailyTaskId) {
      clearInterval(DailyTaskId);
    }
  }
}

export function apply(ctx: Context, config: Config) {
  // 注册数据表
  ctx.model.extend('mangaDatas', {
    id: 'unsigned',
    link: 'string',
    title: 'string',
    base64: 'string'
  })

  // 开启定时任务
  Task.start(ctx);

  // 停用定时任务
  ctx.on('dispose', async () => {
    await Task.end();
  })

  ctx.command('random-azurlane-manga').alias('随机航线一格漫')
    .action(async ({ session }) => {
      const mangaList = await ctx.database.get('mangaDatas', {}, ['id', 'title']);
      const id = mangaList[randomIndex(mangaList.length)].id;
      const mangaData = (await ctx.database.get('mangaDatas', id))[0];

      if (config.showInfo) {
        session.send(`当前图片：${mangaData.title}`);
      }

      try {
        session.send(h('img', { src: mangaData.base64 }))
      } catch (error) {
        logger.error(error);
      }
    })
}
