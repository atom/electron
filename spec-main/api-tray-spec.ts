import { expect } from 'chai';
import { Menu, Tray } from 'electron/main';
import { nativeImage } from 'electron/common';
import { ifdescribe, ifit } from './spec-helpers';
import * as path from 'path';

describe('tray module', () => {
  let tray: Tray;

  beforeEach(() => { tray = new Tray(nativeImage.createEmpty()); });

  afterEach(() => {
    tray.destroy();
    tray = null as any;
  });

  describe('new Tray', () => {
    it('throws a descriptive error for a missing file', () => {
      const badPath = path.resolve('I', 'Do', 'Not', 'Exist');
      expect(() => {
        tray = new Tray(badPath);
      }).to.throw(/Error processing argument at index 0/);
    });

    ifit(process.platform === 'win32')('throws a descriptive error if an invlaid guid is given', () => {
      expect(() => {
        tray = new Tray(nativeImage.createEmpty(), 'I am not a guid');
      }).to.throw('Invalid GUID format');
    });

    ifit(process.platform === 'win32')('accepts a valid guid', () => {
      expect(() => {
        tray = new Tray(nativeImage.createEmpty(), '0019A433-3526-48BA-A66C-676742C0FEFB');
      }).to.not.throw();
    });

    it('is an instance of Tray', () => {
      expect(tray).to.be.an.instanceOf(Tray);
    });
  });

  ifdescribe(process.platform === 'darwin')('tray get/set ignoreDoubleClickEvents', () => {
    it('returns false by default', () => {
      const ignored = tray.getIgnoreDoubleClickEvents();
      expect(ignored).to.be.false('ignored');
    });

    it('can be set to true', () => {
      tray.setIgnoreDoubleClickEvents(true);

      const ignored = tray.getIgnoreDoubleClickEvents();
      expect(ignored).to.be.true('not ignored');
    });
  });

  describe('tray.setContextMenu(menu)', () => {
    it('accepts both null and Menu as parameters', () => {
      expect(() => { tray.setContextMenu(new Menu()); }).to.not.throw();
      expect(() => { tray.setContextMenu(null); }).to.not.throw();
    });
  });

  describe('tray.destroy()', () => {
    it('destroys a tray', () => {
      expect(tray.isDestroyed()).to.be.false('tray should not be destroyed');
      tray.destroy();

      expect(tray.isDestroyed()).to.be.true('tray should be destroyed');
    });
  });

  describe('tray.popUpContextMenu()', () => {
    ifit(process.platform === 'win32')('can be called when menu is showing', function (done) {
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Test' }]));
      setTimeout(() => {
        tray.popUpContextMenu();
        done();
      });
      tray.popUpContextMenu();
    });

    it('can be called with a menu', () => {
      const menu = Menu.buildFromTemplate([{ label: 'Test' }]);
      expect(() => {
        tray.popUpContextMenu(menu);
      }).to.not.throw();
    });

    it('can be called with a position', () => {
      expect(() => {
        tray.popUpContextMenu({ x: 0, y: 0 } as any);
      }).to.not.throw();
    });

    it('can be called with a menu and a position', () => {
      const menu = Menu.buildFromTemplate([{ label: 'Test' }]);
      expect(() => {
        tray.popUpContextMenu(menu, { x: 0, y: 0 });
      }).to.not.throw();
    });

    it('throws an error on invalid arguments', () => {
      expect(() => {
        tray.popUpContextMenu({} as any);
      }).to.throw(/index 0/);
      const menu = Menu.buildFromTemplate([{ label: 'Test' }]);
      expect(() => {
        tray.popUpContextMenu(menu, {} as any);
      }).to.throw(/index 1/);
    });
  });

  describe('tray.closeContextMenu()', () => {
    ifit(process.platform === 'win32')('does not crash when called more than once', function (done) {
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Test' }]));
      setTimeout(() => {
        tray.closeContextMenu();
        tray.closeContextMenu();
        done();
      });
      tray.popUpContextMenu();
    });
  });

  describe('tray.getBounds()', () => {
    afterEach(() => { tray.destroy(); });

    ifit(process.platform !== 'linux')('returns a bounds object', function () {
      const bounds = tray.getBounds();
      expect(bounds).to.be.an('object').and.to.have.all.keys('x', 'y', 'width', 'height');
    });
  });

  describe('tray.setImage(image)', () => {
    it('accepts empty image', () => {
      tray.setImage(nativeImage.createEmpty());
    });
  });

  describe('tray.setPressedImage(image)', () => {
    it('accepts empty image', () => {
      tray.setPressedImage(nativeImage.createEmpty());
    });
  });

  ifdescribe(process.platform === 'darwin')('tray get/set title', () => {
    it('sets/gets non-empty title', () => {
      const title = 'Hello World!';
      tray.setTitle(title);
      const newTitle = tray.getTitle();

      expect(newTitle).to.equal(title);
    });

    it('sets/gets empty title', () => {
      const title = '';
      tray.setTitle(title);
      const newTitle = tray.getTitle();

      expect(newTitle).to.equal(title);
    });

    it('can be called with a font type', () => {
      expect(() => {
        tray.setTitle('Hello World!', 'monospaced');
        tray.setTitle('Hello World!', 'monospacedDigit');
      }).to.not.throw();
    });

    it('throws on non-string font types', () => {
      expect(() => {
        tray.setTitle('Hello World!', 5.4 as any);
      }).to.throw(/index 1/);
    });
  });
});
