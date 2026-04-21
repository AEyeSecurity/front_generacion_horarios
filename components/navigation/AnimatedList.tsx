import React, { useRef, useState, useEffect, useCallback, ReactNode, MouseEventHandler, UIEvent } from 'react';
import { motion, useInView } from 'motion/react';

interface AnimatedItemProps {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

const AnimatedItem: React.FC<AnimatedItemProps> = ({ children, delay = 0, index, onMouseEnter, onClick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5, once: false });
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration: 0.2, delay }}
      className="cursor-pointer"
    >
      {children}
    </motion.div>
  );
};

interface AnimatedListProps {
  items?: string[];
  onItemSelect?: (item: string, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  selectOnHover?: boolean;
  className?: string;
  itemClassName?: string;
  selectedItemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
  selectedIndex?: number;
  maxVisibleItems?: number;
  itemHeightPx?: number;
  itemGapPx?: number;
  listPaddingPx?: number;
  centerItems?: boolean;
}

const AnimatedList: React.FC<AnimatedListProps> = ({
  items = [
    'Item 1',
    'Item 2',
    'Item 3',
    'Item 4',
    'Item 5',
    'Item 6',
    'Item 7',
    'Item 8',
    'Item 9',
    'Item 10',
    'Item 11',
    'Item 12',
    'Item 13',
    'Item 14',
    'Item 15'
  ],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  selectOnHover = true,
  className = '',
  itemClassName = '',
  selectedItemClassName = '',
  displayScrollbar = true,
  initialSelectedIndex = -1,
  selectedIndex,
  maxVisibleItems,
  itemHeightPx = 44,
  itemGapPx = 8,
  listPaddingPx = 8,
  centerItems = false,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number>(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState<number>(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState<number>(1);
  const resolvedSelectedIndex = selectedIndex ?? internalSelectedIndex;
  const resolvedMaxHeightPx =
    typeof maxVisibleItems === 'number' && maxVisibleItems > 0
      ? maxVisibleItems * itemHeightPx + Math.max(0, maxVisibleItems - 1) * itemGapPx + listPaddingPx * 2
      : undefined;

  const setSelected = useCallback(
    (nextIndex: number) => {
      if (selectedIndex == null) setInternalSelectedIndex(nextIndex);
    },
    [selectedIndex]
  );

  const handleItemMouseEnter = useCallback((index: number) => {
    if (!selectOnHover) return;
    setSelected(index);
  }, [selectOnHover, setSelected]);

  const handleItemClick = useCallback(
    (item: string, index: number) => {
      setSelected(index);
      if (onItemSelect) {
        onItemSelect(item, index);
      }
    },
    [onItemSelect, setSelected]
  );

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  };

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelected(Math.min(resolvedSelectedIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelected(Math.max(resolvedSelectedIndex - 1, 0));
      } else if (e.key === 'Enter') {
        if (resolvedSelectedIndex >= 0 && resolvedSelectedIndex < items.length) {
          e.preventDefault();
          if (onItemSelect) {
            onItemSelect(items[resolvedSelectedIndex], resolvedSelectedIndex);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, resolvedSelectedIndex, onItemSelect, enableArrowNavigation, setSelected]);

  useEffect(() => {
    if (!keyboardNav || resolvedSelectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const selectedItem = container.querySelector(`[data-index="${resolvedSelectedIndex}"]`) as HTMLElement | null;
    if (selectedItem) {
      const extraMargin = 50;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;
      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' });
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({
          top: itemBottom - containerHeight + extraMargin,
          behavior: 'smooth'
        });
      }
    }
    setKeyboardNav(false);
  }, [resolvedSelectedIndex, keyboardNav]);

  useEffect(() => {
    if (selectedIndex == null) return;
    setInternalSelectedIndex(selectedIndex);
  }, [selectedIndex]);

  return (
    <div className={`relative w-[500px] ${className}`}>
      <div
        ref={listRef}
        className={`max-h-[400px] overflow-y-auto ${
          displayScrollbar
            ? '[&::-webkit-scrollbar]:w-[8px] [&::-webkit-scrollbar-track]:bg-[#120F17] [&::-webkit-scrollbar-thumb]:bg-[#222] [&::-webkit-scrollbar-thumb]:rounded-[4px]'
            : 'scrollbar-hide'
        }`}
        onScroll={handleScroll}
        style={{
          height: resolvedMaxHeightPx != null ? `${resolvedMaxHeightPx}px` : undefined,
          minHeight: resolvedMaxHeightPx != null ? `${resolvedMaxHeightPx}px` : undefined,
          maxHeight: resolvedMaxHeightPx != null ? `${resolvedMaxHeightPx}px` : undefined,
          padding: `${listPaddingPx}px`,
          scrollbarWidth: displayScrollbar ? 'thin' : 'none',
          scrollbarColor: '#222 #120F17'
        }}
      >
        <div className="flex flex-col" style={{ rowGap: `${itemGapPx}px` }}>
          {items.map((item, index) => (
            <AnimatedItem
              key={index}
              delay={0.1}
              index={index}
              onMouseEnter={() => handleItemMouseEnter(index)}
              onClick={() => handleItemClick(item, index)}
            >
              <div
                data-selected={resolvedSelectedIndex === index ? 'true' : 'false'}
                className={`rounded-lg border border-gray-200 bg-white ${resolvedSelectedIndex === index ? `bg-[#222] ${selectedItemClassName}` : ''} ${
                  centerItems ? 'flex items-center justify-center text-center' : ''
                } ${itemClassName}`}
                style={{ minHeight: `${itemHeightPx}px` }}
              >
                <p className="m-0 text-gray-800">{item}</p>
              </div>
            </AnimatedItem>
          ))}
        </div>
      </div>
      {showGradients && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-[50px] bg-gradient-to-b from-[#120F17] to-transparent pointer-events-none transition-opacity duration-300 ease"
            style={{ opacity: topGradientOpacity }}
          ></div>
          <div
            className="absolute bottom-0 left-0 right-0 h-[100px] bg-gradient-to-t from-[#120F17] to-transparent pointer-events-none transition-opacity duration-300 ease"
            style={{ opacity: bottomGradientOpacity }}
          ></div>
        </>
      )}
    </div>
  );
};

export default AnimatedList;
